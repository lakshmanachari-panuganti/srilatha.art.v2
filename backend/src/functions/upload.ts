import { wrapCors } from '../utils/cors';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { randomUUID } from 'crypto';
import { uploadBlob } from '../utils/blobStorage';
import { requireAdmin } from '../middleware/adminGuard';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function options(): HttpResponseInit { return { status: 204, headers: CORS_HEADERS }; }

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per image

interface DetectedImage {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  ext: 'jpg' | 'png' | 'webp';
}

// Don't trust the client-supplied content-type — verify magic bytes.
function detectImage(buf: Buffer): DetectedImage | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

// POST /api/mgmt/upload — multipart/form-data with field name "file"
async function adminUpload(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = await requireAdmin(request);
  if ('status' in auth) return auth;

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return json({ error: 'file field is required (multipart/form-data)' }, 400);
    }
    const ab = await file.arrayBuffer();
    if (ab.byteLength === 0) return json({ error: 'Empty file' }, 400);
    if (ab.byteLength > MAX_BYTES) return json({ error: `File too large (max ${MAX_BYTES / (1024 * 1024)} MB)` }, 413);

    const buf = Buffer.from(ab);
    const detected = detectImage(buf);
    if (!detected) {
      return json({ error: 'Only JPEG, PNG and WebP images are accepted' }, 415);
    }

    const blobName = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${detected.ext}`;
    const { url } = await uploadBlob('products', blobName, buf, detected.mime);

    return json({ url, blobName, size: buf.length, contentType: detected.mime });
  } catch (err) {
    context.error('adminUpload error', err);
    return json({ error: 'Upload failed' }, 500);
  }
}

app.http('adminUpload', {
  route: 'mgmt/upload',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(adminUpload),
});
