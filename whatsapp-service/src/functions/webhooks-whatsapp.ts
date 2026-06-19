import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { verifySignature } from '../lib/signature';
import { enqueue } from '../lib/storage';
import { webhookLogsRepo } from '../lib/repositories';

const QUEUE_INBOUND = process.env.WHATSAPP_QUEUE_INBOUND ?? 'whatsapp-webhooks';

function plain(body: string, status: number): HttpResponseInit {
  return { status, headers: { 'Content-Type': 'text/plain' }, body };
}
function json(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// ── GET /api/webhooks/whatsapp ─────────────────────────────────────────────
// Meta sends:
//   ?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<n>
// On match: echo the challenge as text/plain 200. Otherwise: 403.
async function handleVerify(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const mode = req.query.get('hub.mode');
  const token = req.query.get('hub.verify_token');
  const challenge = req.query.get('hub.challenge') ?? '';
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!expected) {
    context.error('WHATSAPP_WEBHOOK_VERIFY_TOKEN not configured');
    await webhookLogsRepo.log({
      method: 'GET',
      status: 500,
      error: 'verify-token-not-configured',
    }).catch(err => context.error('webhookLogs write failed:', err));
    return plain('verify token not configured', 500);
  }

  if (mode === 'subscribe' && token === expected) {
    context.log('Webhook verified by Meta');
    await webhookLogsRepo.log({ method: 'GET', status: 200 })
      .catch(err => context.error('webhookLogs write failed:', err));
    return plain(challenge, 200);
  }

  const detail = `verify-token-mismatch (mode=${mode})`;
  context.warn(`Webhook verification failed: ${detail}`);
  await webhookLogsRepo.log({ method: 'GET', status: 403, error: detail })
    .catch(err => context.error('webhookLogs write failed:', err));
  return plain('Forbidden', 403);
}

// ── POST /api/webhooks/whatsapp ────────────────────────────────────────────
// Verifies x-hub-signature-256, enqueues the raw payload for async processing,
// returns 200 fast so Meta doesn't retry. Persistence happens in the queue
// trigger (process-inbound.ts).
async function handleReceive(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const rawBody = await req.text();
  const sigHeader = req.headers.get('x-hub-signature-256');
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    context.error('WHATSAPP_APP_SECRET not configured');
    await webhookLogsRepo.log({
      method: 'POST',
      status: 500,
      error: 'app-secret-not-configured',
    }).catch(err => context.error('webhookLogs write failed:', err));
    return plain('server misconfigured', 500);
  }

  if (!verifySignature(rawBody, sigHeader, appSecret)) {
    const detail = sigHeader ? 'invalid-signature' : 'missing-signature';
    context.warn(`Webhook rejected: ${detail}`);
    await webhookLogsRepo.log({
      method: 'POST',
      status: 403,
      signatureValid: false,
      error: detail,
    }).catch(err => context.error('webhookLogs write failed:', err));
    return plain('Forbidden', 403);
  }

  try {
    await enqueue(QUEUE_INBOUND, { rawBody, receivedAt: new Date().toISOString() });
    await webhookLogsRepo.log({
      method: 'POST',
      status: 200,
      signatureValid: true,
      payloadSummary: rawBody.slice(0, 500),
    }).catch(err => context.error('webhookLogs write failed:', err));
    return json({ received: true });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    context.error('Failed to enqueue webhook payload:', err);
    await webhookLogsRepo.log({
      method: 'POST',
      status: 500,
      signatureValid: true,
      error: detail,
    }).catch(logErr => context.error('webhookLogs write failed:', logErr));
    // Surface 5xx so Meta retries — we don't want to silently drop a verified event.
    return plain('enqueue failed', 500);
  }
}

async function router(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === 'GET') return handleVerify(req, context);
  if (req.method === 'POST') return handleReceive(req, context);
  return plain('Method Not Allowed', 405);
}

app.http('webhooksWhatsapp', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'webhooks/whatsapp',
  handler: router,
});
