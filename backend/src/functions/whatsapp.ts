import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

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
// Core WhatsApp sender — importable by other functions
// ---------------------------------------------------------------------------
export async function sendWhatsApp(to: string, message: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.warn('WhatsApp env vars not configured — skipping notification');
    return;
  }

  const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: to.replace(/[^0-9]/g, ''),
    type: 'text',
    text: { body: message },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp API error: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Message template helpers
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

  return [
    '🎨 *New Order - Srilatha Art*',
    '',
    `Order ID: ${params.orderId}`,
    `Customer: ${params.name}`,
    `Phone: ${params.phone}`,
    `Items:\n${itemsList}`,
    `Total: ₹${params.total}`,
    `Address: ${params.address}`,
    '',
    'Please confirm and begin processing!',
  ].join('\n');
}

export function buildShippedMessage(params: {
  name: string;
  orderId: string;
  trackingNumber: string;
}): string {
  return [
    `Hi ${params.name}! 🎨`,
    '',
    `Your Srilatha Art order #${params.orderId} has been shipped!`,
    `Tracking: ${params.trackingNumber}`,
    '',
    'Expected delivery: 3-5 business days.',
    'Questions? Reply to this message!',
  ].join('\n');
}

export function buildCustomOrderMessage(params: {
  name: string;
  phone: string;
  email: string;
  description: string;
  budget?: string;
}): string {
  return [
    '🎨 *New Custom Order Request*',
    '',
    `Name: ${params.name}`,
    `Phone: ${params.phone}`,
    `Email: ${params.email}`,
    `Description: ${params.description}`,
    `Budget: ${params.budget ?? 'Not specified'}`,
    '',
    'Reply to discuss!',
  ].join('\n');
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

  try {
    await sendWhatsApp(to, message);
    return json({ success: true });
  } catch (err: any) {
    context.error('WhatsApp send error:', err);
    return json({ error: err.message ?? 'Failed to send WhatsApp message' }, 502);
  }
}

app.http('whatsappSend', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'whatsapp/send',
  handler: httpSendWhatsApp,
});
