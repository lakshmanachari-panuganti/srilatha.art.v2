import { wrapCors } from '../utils/cors';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { renderTemplate } from '../templates/whatsappTemplates';

// Site-specific store contact number, injected into every customer-facing
// template as the trailing `Store Contact Number` positional variable.
// Templates in ../templates/whatsappTemplates.ts are site-agnostic and read
// this value via the positional placeholder — change this constant (or move
// it to config) when deploying for a different store.
export const STORE_CONTACT_NUMBER = '+91 9052380325';

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------
function isAdmin(req: HttpRequest): boolean {
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${process.env.ADMIN_SECRET}`;
}

// ---------------------------------------------------------------------------
// Core WhatsApp sender — importable by other functions.
//
// Forwards the message to the standalone WhatsApp microservice, which enqueues
// the job, calls Meta, and writes the outbound row to whatsappMessages in the
// shared storage. This keeps every outbound message (orders, OTPs, etc.)
// visible in the admin conversations UI alongside inbound replies.
//
// Returns a structured result rather than throwing so callers can decide
// whether a failed send is fatal (user-facing OTP) or best-effort (admin ping).
// `reason: 'not-configured'` is a normal operational state in local/dev env;
// callers should NOT surface success to users when this is returned.
// ---------------------------------------------------------------------------
export type WhatsAppSendResult =
  | { ok: true }
  | { ok: false; reason: 'not-configured' | 'api-error'; detail?: string };

export async function sendWhatsApp(to: string, message: string): Promise<WhatsAppSendResult> {
  const baseUrl = process.env.WHATSAPP_SERVICE_URL;
  const serviceKey = process.env.WHATSAPP_SERVICE_KEY;

  if (!baseUrl || !serviceKey) {
    console.warn('WHATSAPP_SERVICE_URL or WHATSAPP_SERVICE_KEY not set — skipping notification');
    return { ok: false, reason: 'not-configured' };
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/api/messages/send?code=${encodeURIComponent(serviceKey)}`;
  const body = {
    to: to.replace(/[^0-9]/g, ''),
    type: 'text',
    text: { body: message },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => `HTTP ${res.status}`);
      console.error('WhatsApp microservice send error:', detail);
      return { ok: false, reason: 'api-error', detail };
    }
    // The microservice returns 202 with `{accepted:true,idempotencyKey}` —
    // the actual Meta call happens in its outbound queue trigger. From this
    // call site's perspective the message is on its way.
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('WhatsApp microservice fetch failed:', detail);
    return { ok: false, reason: 'api-error', detail };
  }
}

// ---------------------------------------------------------------------------
// Message builders — thin wrappers around the central template catalog.
// New templates do NOT need a wrapper; callers can use renderTemplate() directly.
// ---------------------------------------------------------------------------
export function buildNewOrderMessage(params: {
  orderId: string;
  name: string;
  phone: string;
  items: Array<{ name: string; qty: number; price: number }>;
  total: number;
  address: string;
}): string {
  const itemsList = params.items
    .map((i) => `  • ${i.name} × ${i.qty} — ₹${i.price}`)
    .join('\n');
  return renderTemplate('new_order', [
    params.orderId,
    params.name,
    params.phone,
    itemsList,
    params.total,
    params.address,
  ]);
}

export function buildShippedMessage(params: {
  name: string;
  orderId: string;
  courier?: string;
  trackingNumber: string;
}): string {
  return renderTemplate('order_shipped', [
    params.name,
    params.orderId,
    params.courier ?? 'Courier partner',
    params.trackingNumber,
    STORE_CONTACT_NUMBER,
  ]);
}

export function buildPasswordResetOtpMessage(params: {
  name: string;
  otp: string;
  validityMinutes: number;
}): string {
  return renderTemplate('reset_password_otp', [
    params.name,
    params.otp,
    params.validityMinutes,
    STORE_CONTACT_NUMBER,
  ]);
}

export function buildCustomOrderMessage(params: {
  name: string;
  phone: string;
  email: string;
  description: string;
  budget?: string;
}): string {
  return renderTemplate('custom_order', [
    params.name,
    params.phone,
    params.email,
    params.description,
    params.budget ?? 'Not specified',
  ]);
}

// ---------------------------------------------------------------------------
// HTTP endpoint: POST /api/whatsapp/send  (admin only)
// ---------------------------------------------------------------------------
async function httpSendWhatsApp(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (req.method === 'OPTIONS') {
    return { status: 204, headers: CORS_HEADERS };
  }

  if (!isAdmin(req)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { to?: string; message?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { to, message } = body;
  if (!to || !message) {
    return json({ error: '`to` and `message` are required' }, 400);
  }

  const result = await sendWhatsApp(to, message);
  if (!result.ok) {
    context.error('WhatsApp send error:', result.reason, result.detail);
    if (result.reason === 'not-configured') {
      return json({ error: 'WhatsApp is not configured on this server (missing credentials).' }, 503);
    }
    return json({ error: result.detail ?? 'Failed to send WhatsApp message' }, 502);
  }
  return json({ success: true });
}

app.http('whatsappSend', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'whatsapp/send',
  handler: wrapCors(httpSendWhatsApp),
});
