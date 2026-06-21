import { wrapCors } from '../utils/cors';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { randomUUID } from 'crypto';
import { requireAdmin } from '../middleware/adminGuard';
import {
  AiContentError,
  generateProductContent,
  type AiErrorCode,
  type AiImageSource,
} from '../services/aiContentGenerator';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const ERROR_HINT: Record<AiErrorCode, string> = {
  MISSING_CONFIG: 'AI content generation is not configured on the server.',
  AUTH_ERROR: 'Authentication with the AI service failed.',
  DEPLOYMENT_NOT_FOUND: 'Configured AI deployment was not found.',
  RATE_LIMIT: 'AI request limit reached. Try again in a minute.',
  SERVICE_UNAVAILABLE: 'AI service is temporarily unavailable.',
  TIMEOUT: 'AI service did not respond in time.',
  IMAGE_PROCESSING_ERROR: 'The image could not be processed by the AI service.',
  INVALID_RESPONSE: 'AI service returned an invalid response.',
  CONTENT_VALIDATION_FAILED: 'Generated content did not meet quality requirements.',
  NETWORK_ERROR: 'Could not reach AI service.',
  INVALID_INPUT: 'Invalid input.',
  INTERNAL_ERROR: 'Internal application error.',
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): HttpResponseInit {
  return {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function options(): HttpResponseInit { return { status: 204, headers: CORS_HEADERS }; }

function errorJson(status: number, code: AiErrorCode, requestId: string): HttpResponseInit {
  return json({ code, error: ERROR_HINT[code] }, status, { 'X-Request-Id': requestId });
}

interface LogPayload {
  requestId: string;
  adminId: string;
  code: AiErrorCode;
  azureStatus?: number;
  deploymentName?: string;
  details?: string;
}

function logFailure(context: InvocationContext, p: LogPayload) {
  context.error('aiGenerateProductContent failed', {
    errorType: 'AiContentError',
    code: p.code,
    azureStatus: p.azureStatus ?? null,
    deploymentName: p.deploymentName ?? null,
    requestId: p.requestId,
    timestamp: new Date().toISOString(),
    adminId: p.adminId,
    details: p.details ?? null,
  });
}

// ---------------------------------------------------------------------------
// POST /api/mgmt/products/ai-generate
//   body: { imageUrl: string }
// ---------------------------------------------------------------------------

async function aiGenerate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = await requireAdmin(request);
  if ('status' in auth) return auth;

  const requestId = randomUUID();
  const adminId = 'sub' in auth ? auth.sub : 'admin';

  let body: { imageUrl?: string };
  try {
    body = (await request.json()) as { imageUrl?: string };
  } catch {
    logFailure(context, { requestId, adminId, code: 'INVALID_INPUT', details: 'request body was not valid JSON' });
    return errorJson(400, 'INVALID_INPUT', requestId);
  }

  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  if (!imageUrl) {
    logFailure(context, { requestId, adminId, code: 'INVALID_INPUT', details: 'imageUrl missing' });
    return errorJson(400, 'INVALID_INPUT', requestId);
  }

  try {
    const { content, deploymentName } = await generateProductContent(imageUrl);
    context.log('aiGenerate: success', { requestId, adminId, deploymentName });
    return json(content, 200, { 'X-Request-Id': requestId });
  } catch (err) {
    if (err instanceof AiContentError) {
      logFailure(context, {
        requestId, adminId, code: err.code, azureStatus: err.azureStatus,
        details: err.details, deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
      });
      return errorJson(err.status, err.code, requestId);
    }
    logFailure(context, {
      requestId, adminId, code: 'INTERNAL_ERROR',
      details: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    return errorJson(500, 'INTERNAL_ERROR', requestId);
  }
}

// ---------------------------------------------------------------------------
// POST /api/mgmt/products/ai-generate-upload
//   body: multipart/form-data with field "file"
//
// Analyse a still-local image without writing it to blob storage first.
// Useful when the admin wants AI suggestions before deciding category /
// finalising the product.
// ---------------------------------------------------------------------------

const MAX_AI_UPLOAD_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function detectImageMime(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp';
  return null;
}

async function aiGenerateFromFile(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = await requireAdmin(request);
  if ('status' in auth) return auth;

  const requestId = randomUUID();
  const adminId = 'sub' in auth ? auth.sub : 'admin';

  let file: { buffer: Buffer; name: string } | null = null;
  try {
    const formData = await request.formData();
    const f = formData.get('file');
    if (f && typeof f !== 'string') {
      const ab = await f.arrayBuffer();
      file = { buffer: Buffer.from(ab), name: f.name };
    }
  } catch {
    logFailure(context, { requestId, adminId, code: 'INVALID_INPUT', details: 'multipart parse failed' });
    return errorJson(400, 'INVALID_INPUT', requestId);
  }

  if (!file) {
    logFailure(context, { requestId, adminId, code: 'INVALID_INPUT', details: 'file field missing' });
    return errorJson(400, 'INVALID_INPUT', requestId);
  }
  if (file.buffer.length > MAX_AI_UPLOAD_FILE_SIZE) {
    logFailure(context, { requestId, adminId, code: 'INVALID_INPUT', details: `file too large: ${file.buffer.length}` });
    return errorJson(400, 'INVALID_INPUT', requestId);
  }
  const mime = detectImageMime(file.buffer);
  if (!mime) {
    logFailure(context, { requestId, adminId, code: 'INVALID_INPUT', details: 'magic-byte check failed' });
    return errorJson(400, 'INVALID_INPUT', requestId);
  }

  const source: AiImageSource = { kind: 'buffer', buffer: file.buffer, mimeType: mime };

  try {
    const { content, deploymentName } = await generateProductContent(source);
    context.log('aiGenerateFromFile: success', { requestId, adminId, deploymentName, mime });
    return json(content, 200, { 'X-Request-Id': requestId });
  } catch (err) {
    if (err instanceof AiContentError) {
      logFailure(context, {
        requestId, adminId, code: err.code, azureStatus: err.azureStatus,
        details: err.details, deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
      });
      return errorJson(err.status, err.code, requestId);
    }
    logFailure(context, {
      requestId, adminId, code: 'INTERNAL_ERROR',
      details: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    return errorJson(500, 'INTERNAL_ERROR', requestId);
  }
}

app.http('aiGenerateProductContent', {
  route: 'mgmt/products/ai-generate',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(aiGenerate),
});

app.http('aiGenerateProductContentFromFile', {
  route: 'mgmt/products/ai-generate-upload',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(aiGenerateFromFile),
});
