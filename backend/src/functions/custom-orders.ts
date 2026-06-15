import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import crypto from 'node:crypto';
import { upsertEntity, queryEntities } from '../utils/tableStorage';
import { sendWhatsApp } from './whatsapp';

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
// POST /api/custom-orders
// ---------------------------------------------------------------------------
async function handlePostCustomOrder(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (req.method === 'OPTIONS') return { status: 204, headers: CORS_HEADERS };

  let body: {
    name?: string;
    phone?: string;
    email?: string;
    description?: string;
    budget?: string;
    category?: string;
    referenceImageUrl?: string;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { name, phone, email, description, budget, category, referenceImageUrl } = body;

  // Validate required fields
  if (!name || !phone || !email || !description) {
    return json(
      { error: 'name, phone, email and description are required' },
      400,
    );
  }

  const id = `CO-${Date.now()}`;
  const createdAt = new Date().toISOString();

  try {
    await upsertEntity('customOrders', {
      partitionKey: 'pending',
      rowKey: id,
      name,
      phone,
      email,
      description,
      budget: budget ?? '',
      category: category ?? '',
      referenceImageUrl: referenceImageUrl ?? '',
      status: 'pending',
      createdAt,
    });

    // WhatsApp notification — non-fatal
    const adminNumber = process.env.WHATSAPP_ADMIN_NUMBER;
    if (adminNumber) {
      try {
        await sendWhatsApp(
          adminNumber,
          `🎨 *New Custom Order Request*\n\nID: ${id}\nName: ${name}\nPhone: ${phone}\nEmail: ${email}\nDescription: ${description}\nBudget: ${budget ?? 'Not specified'}\nCategory: ${category ?? 'Not specified'}\n\nReply to discuss!`,
        );
      } catch (waErr) {
        context.warn('WhatsApp notification failed (non-fatal):', waErr);
      }
    }

    return json(
      {
        success: true,
        id,
        message:
          'Your custom order request has been received. We will contact you within 24 hours.',
      },
      201,
    );
  } catch (err: unknown) {
    context.error('Custom order creation error:', err);
    return json({ error: 'Failed to save custom order request. Please try again.' }, 500);
  }
}

// ---------------------------------------------------------------------------
// GET /api/custom-orders  (admin)
// ---------------------------------------------------------------------------
async function handleGetCustomOrders(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  // Admin auth
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const orders = await queryEntities('customOrders', `PartitionKey eq 'pending'`);
    return json({ orders, total: orders.length });
  } catch (err: unknown) {
    context.error('List custom orders error:', err);
    return json({ error: 'Failed to fetch custom orders' }, 500);
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
app.http('customOrdersPost', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'custom-orders',
  handler: handlePostCustomOrder,
});

app.http('customOrdersGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'custom-orders',
  handler: handleGetCustomOrders,
});
