import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getTableClient, upsertEntity, queryEntities, deleteEntity } from '../utils/tableStorage';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function options(): HttpResponseInit {
  return {
    status: 204,
    headers: CORS_HEADERS,
  };
}

const CONNECTION_STRING =
  process.env.AZURE_STORAGE_CONNECTION_STRING ?? '';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID ?? '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? '';
const JWT_SECRET = process.env.JWT_SECRET ?? '';
const FREE_SHIPPING_THRESHOLD_PAISE = parseInt(
  process.env.FREE_SHIPPING_THRESHOLD_PAISE ?? '99900',
  10,
);
const SHIPPING_COST_PAISE = 9900;

/** All possible order partition keys (statuses). */
const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrderItem {
  productId: string;
  name: string;
  qty: number;
  price: number; // in paise
}

interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
}

interface AddressInfo {
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

interface OrderEntity {
  partitionKey: string;
  rowKey: string;
  status: string;
  razorpayOrderId: string;
  customer: string;  // JSON-serialised CustomerInfo
  address: string;   // JSON-serialised AddressInfo
  subtotal: number;
  shipping: number;
  total: number;
  createdAt: string;
  couponCode?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// POST /api/orders  – create order & Razorpay order
// ---------------------------------------------------------------------------

async function createOrder(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();

  try {
    const body = (await request.json()) as {
      items: OrderItem[];
      customer: CustomerInfo;
      address: AddressInfo;
      couponCode?: string;
    };

    const { items, customer, address, couponCode } = body;

    if (!items?.length || !customer || !address) {
      return json({ error: 'items, customer and address are required' }, 400);
    }

    // Calculate amounts (paise)
    const subtotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const shipping = subtotal >= FREE_SHIPPING_THRESHOLD_PAISE ? 0 : SHIPPING_COST_PAISE;
    const total = subtotal + shipping;

    const orderId = `ORD-${Date.now()}`;

    // Create Razorpay order
    const razorpayCredentials = Buffer.from(
      `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`,
    ).toString('base64');

    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${razorpayCredentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: total,
        currency: 'INR',
        receipt: orderId,
      }),
    });

    if (!razorpayRes.ok) {
      const errBody = await razorpayRes.text();
      context.error('Razorpay order creation failed', errBody);
      return json({ error: 'Failed to create payment order' }, 502);
    }

    const razorpayOrder = (await razorpayRes.json()) as { id: string };
    const razorpayOrderId = razorpayOrder.id;

    // Save order to Table Storage
    const orderEntity: OrderEntity = {
      partitionKey: 'pending',
      rowKey: orderId,
      status: 'pending',
      razorpayOrderId,
      customer: JSON.stringify(customer),
      address: JSON.stringify(address),
      subtotal,
      shipping,
      total,
      createdAt: new Date().toISOString(),
      ...(couponCode ? { couponCode } : {}),
    };
    await upsertEntity('orders', orderEntity);

    // Save order items to Table Storage
    await Promise.all(
      items.map((item, index) =>
        upsertEntity('orderItems', {
          partitionKey: orderId,
          rowKey: `${item.productId}-${index}`,
          productId: item.productId,
          name: item.name,
          qty: item.qty,
          price: item.price,
        }),
      ),
    );

    return json({
      orderId,
      razorpayOrderId,
      amount: total,
      currency: 'INR',
      key: RAZORPAY_KEY_ID,
    });
  } catch (err) {
    context.error('createOrder error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// GET /api/orders/:orderId  – retrieve order (JWT required)
// ---------------------------------------------------------------------------

async function getOrder(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();

  try {
    // Verify JWT
    const authHeader = request.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return json({ error: 'Authorization header missing or malformed' }, 401);
    }

    try {
      jwt.verify(token, JWT_SECRET);
    } catch {
      return json({ error: 'Invalid or expired token' }, 401);
    }

    const orderId = request.params.orderId;
    if (!orderId) {
      return json({ error: 'orderId is required' }, 400);
    }

    // Search across all status partitions
    let orderEntity: OrderEntity | null = null;

    for (const status of ORDER_STATUSES) {
      const filter = `PartitionKey eq '${status}' and RowKey eq '${orderId}'`;
      const results = await queryEntities<OrderEntity>('orders', filter);
      if (results && results.length > 0) {
        orderEntity = results[0];
        break;
      }
    }

    if (!orderEntity) {
      return json({ error: 'Order not found' }, 404);
    }

    // Fetch order items
    const itemsFilter = `PartitionKey eq '${orderId}'`;
    const items = await queryEntities('orderItems', itemsFilter);

    return json({
      ...normalizeOrder(orderEntity),
      items: items ?? [],
    });
  } catch (err) {
    context.error('getOrder error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/orders/:orderId/verify-payment
// ---------------------------------------------------------------------------

async function verifyPayment(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();

  try {
    const orderId = request.params.orderId;
    if (!orderId) {
      return json({ error: 'orderId is required' }, 400);
    }

    const body = (await request.json()) as {
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    };

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return json(
        { error: 'razorpayOrderId, razorpayPaymentId and razorpaySignature are required' },
        400,
      );
    }

    // Verify HMAC-SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return json({ error: 'Invalid payment signature' }, 400);
    }

    // Find the order in 'pending' partition first, then others
    let orderEntity: OrderEntity | null = null;

    for (const status of ORDER_STATUSES) {
      const filter = `PartitionKey eq '${status}' and RowKey eq '${orderId}'`;
      const results = await queryEntities<OrderEntity>('orders', filter);
      if (results && results.length > 0) {
        orderEntity = results[0];
        break;
      }
    }

    if (!orderEntity) {
      return json({ error: 'Order not found' }, 404);
    }

    const previousStatus = orderEntity.partitionKey;

    // Move order: upsert with new partitionKey='confirmed', then delete old entry
    const { status: _status, partitionKey: _pk, ...restOrder } = orderEntity;
    const confirmedEntity: OrderEntity = {
      ...restOrder,
      partitionKey: 'confirmed',
      status: 'confirmed',
    };
    await upsertEntity('orders', confirmedEntity);

    // Delete old entity only if it had a different partition
    if (previousStatus !== 'confirmed') {
      await deleteEntity('orders', previousStatus, orderId);
    }

    // Record payment event in orderEvents table
    await upsertEntity('orderEvents', {
      partitionKey: orderId,
      rowKey: `payment-${Date.now()}`,
      eventType: 'payment_verified',
      razorpayOrderId,
      razorpayPaymentId,
      timestamp: new Date().toISOString(),
    });

    return json({ success: true, orderId });
  } catch (err) {
    context.error('verifyPayment error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// Utility: normalise order entity for API response
// ---------------------------------------------------------------------------

function normalizeOrder(entity: OrderEntity): Record<string, unknown> {
  const { partitionKey, rowKey, etag, timestamp, customer, address, ...rest } =
    entity as OrderEntity & { etag?: string; timestamp?: unknown };

  return {
    orderId: rowKey,
    status: partitionKey,
    customer: safeJsonParse(customer),
    address: safeJsonParse(address),
    ...rest,
  };
}

function safeJsonParse(value: string | undefined): unknown {
  if (!value) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// Register functions
// ---------------------------------------------------------------------------

app.http('createOrder', {
  route: 'orders',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: createOrder,
});

app.http('getOrder', {
  route: 'orders/{orderId}',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: getOrder,
});

app.http('verifyPayment', {
  route: 'orders/{orderId}/verify-payment',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: verifyPayment,
});
