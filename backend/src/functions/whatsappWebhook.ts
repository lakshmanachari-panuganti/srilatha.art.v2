import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import crypto from 'node:crypto';
import { upsertEntity, queryEntities } from '../utils/tableStorage';

// ---------------------------------------------------------------------------
// CORS — webhook itself doesn't need browser CORS, but OPTIONS is cheap.
// ---------------------------------------------------------------------------
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-hub-signature-256',
};

const HEALTH_TABLE = 'whatsappHealth';
const HEALTH_PK = 'health';
const HEALTH_RK = 'singleton';
const MESSAGES_TABLE = 'whatsappMessages';

interface HealthEntity {
  partitionKey: string;
  rowKey: string;
  lastWebhookReceivedAt?: string;
  lastWebhookError?: string;
  lastWebhookErrorAt?: string;
  lastSendOkAt?: string;
  lastSendError?: string;
  lastSendErrorDetail?: string;
  lastSendErrorAt?: string;
  lastVerifyOkAt?: string;
  lastVerifyError?: string;
  lastVerifyErrorAt?: string;
}

export async function updateHealth(patch: Partial<HealthEntity>): Promise<void> {
  // Best-effort merge — read current, overlay, upsert. Never throw.
  try {
    const current = await queryEntities<HealthEntity>(HEALTH_TABLE, `PartitionKey eq '${HEALTH_PK}' and RowKey eq '${HEALTH_RK}'`);
    const merged: HealthEntity = {
      ...(current[0] ?? {}),
      partitionKey: HEALTH_PK,
      rowKey: HEALTH_RK,
      ...patch,
    };
    await upsertEntity(HEALTH_TABLE, merged);
  } catch (err) {
    console.error('whatsappHealth update failed:', err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/whatsapp/webhook — Meta verification handshake.
//   Query: hub.mode=subscribe & hub.verify_token=<token> & hub.challenge=<n>
//   Success: echo hub.challenge as text/plain 200.
//   Failure: 403.
// ---------------------------------------------------------------------------
async function verifyWebhook(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === 'OPTIONS') return { status: 204, headers: CORS_HEADERS };

  const mode = req.query.get('hub.mode');
  const token = req.query.get('hub.verify_token');
  const challenge = req.query.get('hub.challenge') ?? '';
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!expected) {
    const msg = 'WHATSAPP_WEBHOOK_VERIFY_TOKEN not configured';
    context.error(msg);
    await updateHealth({ lastVerifyError: msg, lastVerifyErrorAt: new Date().toISOString() });
    return { status: 500, headers: CORS_HEADERS, body: msg };
  }

  if (mode === 'subscribe' && token === expected) {
    context.log('WhatsApp webhook verified');
    await updateHealth({ lastVerifyOkAt: new Date().toISOString(), lastVerifyError: '', lastVerifyErrorAt: '' });
    return {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
      body: challenge,
    };
  }

  const detail = `verify_token mismatch (mode=${mode})`;
  context.warn(`WhatsApp webhook verification failed: ${detail}`);
  await updateHealth({ lastVerifyError: detail, lastVerifyErrorAt: new Date().toISOString() });
  return { status: 403, headers: CORS_HEADERS, body: 'Forbidden' };
}

// ---------------------------------------------------------------------------
// POST /api/whatsapp/webhook — incoming messages + status callbacks.
// ---------------------------------------------------------------------------
function verifySignature(rawBody: string, headerSig: string, secret: string): boolean {
  // Meta sends header `x-hub-signature-256: sha256=<hex>`.
  const prefix = 'sha256=';
  if (!headerSig.startsWith(prefix)) return false;
  const provided = headerSig.slice(prefix.length);
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(provided, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Best-effort extraction of message body text; templates carry no text in this
// payload shape so we surface their type for display.
function describeMessage(m: WhatsappIncomingMessage): { body?: string; templateName?: string; type: string } {
  const type = m.type ?? 'unknown';
  if (m.text?.body) return { body: m.text.body, type };
  if (m.button?.text) return { body: m.button.text, type };
  if (m.interactive?.button_reply?.title) return { body: m.interactive.button_reply.title, type };
  if (m.interactive?.list_reply?.title) return { body: m.interactive.list_reply.title, type };
  if (m.image?.caption) return { body: `[image] ${m.image.caption}`, type };
  if (m.video?.caption) return { body: `[video] ${m.video.caption}`, type };
  if (m.document?.filename) return { body: `[document] ${m.document.filename}`, type };
  if (m.audio?.id) return { body: '[audio]', type };
  if (m.sticker?.id) return { body: '[sticker]', type };
  if (m.location) return { body: `[location] ${m.location.latitude},${m.location.longitude}`, type };
  return { body: `[${type}]`, type };
}

interface WhatsappIncomingMessage {
  id: string;        // wamid
  from: string;      // E.164
  timestamp: string; // unix seconds
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  image?: { caption?: string; id?: string };
  video?: { caption?: string; id?: string };
  document?: { filename?: string; id?: string };
  audio?: { id?: string };
  sticker?: { id?: string };
  location?: { latitude?: number; longitude?: number };
}

interface WhatsappStatusUpdate {
  id: string;         // wamid of an outbound message we sent
  recipient_id: string;
  status: string;     // sent | delivered | read | failed
  timestamp: string;
  errors?: Array<{ code: number; title: string; message?: string }>;
}

interface WhatsappWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: WhatsappIncomingMessage[];
        statuses?: WhatsappStatusUpdate[];
      };
    }>;
  }>;
}

async function receiveWebhook(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === 'OPTIONS') return { status: 204, headers: CORS_HEADERS };

  const rawBody = await req.text();
  const sigHeader = req.headers.get('x-hub-signature-256') ?? '';
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    const msg = 'WHATSAPP_APP_SECRET not configured';
    context.error(msg);
    await updateHealth({ lastWebhookError: msg, lastWebhookErrorAt: new Date().toISOString() });
    return { status: 500, headers: CORS_HEADERS, body: msg };
  }

  if (!sigHeader || !verifySignature(rawBody, sigHeader, appSecret)) {
    const detail = sigHeader ? 'invalid x-hub-signature-256' : 'missing x-hub-signature-256';
    context.warn(`WhatsApp webhook rejected: ${detail}`);
    await updateHealth({ lastWebhookError: detail, lastWebhookErrorAt: new Date().toISOString() });
    return { status: 403, headers: CORS_HEADERS, body: 'Forbidden' };
  }

  let payload: WhatsappWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsappWebhookPayload;
  } catch {
    const detail = 'invalid JSON payload';
    context.warn(`WhatsApp webhook ${detail}`);
    await updateHealth({ lastWebhookError: detail, lastWebhookErrorAt: new Date().toISOString() });
    return { status: 400, headers: CORS_HEADERS, body: 'Bad Request' };
  }

  const receivedAt = new Date().toISOString();
  let storedMessages = 0;
  let storedStatuses = 0;
  let writeErrors: string[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      // Resolve contact profile name (best-effort).
      const contactName = value.contacts?.[0]?.profile?.name ?? '';

      for (const m of value.messages ?? []) {
        const tsIso = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : receivedAt;
        const { body, type } = describeMessage(m);
        try {
          await upsertEntity(MESSAGES_TABLE, {
            partitionKey: m.from,
            rowKey: `${tsIso}-${m.id}`,
            direction: 'inbound',
            wamid: m.id,
            type,
            body: body ?? '',
            contactName,
            read: false,
            timestamp: tsIso,
            receivedAt,
          });
          storedMessages++;
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          writeErrors.push(`message ${m.id}: ${detail}`);
          context.error(`whatsappMessages upsert failed for ${m.id}:`, err);
        }
      }

      for (const s of value.statuses ?? []) {
        try {
          // Locate the outbound row by wamid so we can patch its delivery status.
          const matches = await queryEntities<{ partitionKey: string; rowKey: string; wamid?: string }>(
            MESSAGES_TABLE,
            `wamid eq '${s.id}'`,
          );
          if (matches.length > 0) {
            for (const row of matches) {
              await upsertEntity(MESSAGES_TABLE, {
                ...row,
                status: s.status,
                statusUpdatedAt: receivedAt,
                ...(s.errors && s.errors.length > 0
                  ? { statusError: s.errors.map(e => `${e.code} ${e.title}${e.message ? ` — ${e.message}` : ''}`).join('; ') }
                  : {}),
              });
            }
          } else {
            // No outbound row to patch — log the status orphan so we don't lose it.
            await upsertEntity(MESSAGES_TABLE, {
              partitionKey: s.recipient_id,
              rowKey: `status-${s.id}-${receivedAt}`,
              direction: 'outbound',
              wamid: s.id,
              status: s.status,
              timestamp: s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : receivedAt,
              statusUpdatedAt: receivedAt,
              body: '',
              read: true,
            });
          }
          storedStatuses++;
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          writeErrors.push(`status ${s.id}: ${detail}`);
          context.error(`whatsappMessages status upsert failed for ${s.id}:`, err);
        }
      }
    }
  }

  context.log(`WhatsApp webhook OK: ${storedMessages} message(s), ${storedStatuses} status(es)`);

  if (writeErrors.length > 0) {
    await updateHealth({
      lastWebhookReceivedAt: receivedAt,
      lastWebhookError: writeErrors.join(' | '),
      lastWebhookErrorAt: receivedAt,
    });
  } else {
    await updateHealth({
      lastWebhookReceivedAt: receivedAt,
      lastWebhookError: '',
      lastWebhookErrorAt: '',
    });
  }

  // Always 200 once signature is valid — Meta retries non-2xx aggressively.
  return { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify({ received: true }) };
}

async function whatsappWebhookRouter(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === 'GET') return verifyWebhook(req, context);
  if (req.method === 'POST') return receiveWebhook(req, context);
  return { status: 204, headers: CORS_HEADERS };
}

app.http('whatsappWebhook', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'whatsapp/webhook',
  handler: whatsappWebhookRouter,
});
