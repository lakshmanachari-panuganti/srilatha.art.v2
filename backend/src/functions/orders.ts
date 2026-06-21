import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getTableClient, upsertEntity, queryEntities, deleteEntity, getEntity } from '../utils/tableStorage';
import { computeCouponDiscount, getCouponByCode } from './coupons';
import { sendEmail } from '../utils/email';
import { renderOrderConfirmation } from '../templates/emailTemplates';
import { STORE_CONTACT_NUMBER } from './whatsapp';

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
  discount: number;
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

    // Calculate amounts (paise) — server is the source of truth.
    const subtotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
    let shipping = subtotal >= FREE_SHIPPING_THRESHOLD_PAISE ? 0 : SHIPPING_COST_PAISE;
    let discount = 0;
    let appliedCouponCode: string | undefined;

    if (couponCode) {
      const coupon = await getCouponByCode(couponCode);
      if (coupon) {
        const result = computeCouponDiscount(coupon, subtotal, shipping);
        if (result.valid) {
          discount = result.discount;
          if (result.freeShipping) shipping = 0;
          appliedCouponCode = coupon.rowKey;
        }
        // If the coupon is invalid we proceed without it rather than blocking
        // the checkout — the UX layer already validated. Server-side is the
        // hard ceiling: nothing extra is applied.
      }
    }

    const total = Math.max(0, subtotal - discount + shipping);
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
      discount,
      total,
      createdAt: new Date().toISOString(),
      ...(appliedCouponCode ? { couponCode: appliedCouponCode } : {}),
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
      subtotal,
      shipping,
      discount,
      appliedCouponCode: appliedCouponCode ?? null,
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

    let claims: { email?: string };
    try {
      claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { email?: string };
    } catch {
      return json({ error: 'Invalid or expired token' }, 401);
    }
    const callerEmail = claims?.email?.toLowerCase();
    if (!callerEmail) {
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

    // Object-level authorization: a customer may only read their own orders.
    // Mismatched callers get 404 (not 403) to avoid confirming the order exists.
    const ownerEmail =
      (safeJsonParse(orderEntity.customer) as { email?: string } | null)?.email?.toLowerCase();
    if (!ownerEmail || ownerEmail !== callerEmail) {
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

    // Bind the signed razorpayOrderId to the order being confirmed. Without
    // this check, a valid signature from a *different* (cheap) payment could
    // be replayed to flip a victim's order to 'confirmed'.
    if (orderEntity.razorpayOrderId !== razorpayOrderId) {
      return json({ error: 'Order/payment mismatch' }, 400);
    }

    // Verify HMAC-SHA256 signature with timing-safe compare.
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    const sigBufA = Buffer.from(expectedSignature, 'hex');
    const sigBufB = Buffer.from(razorpaySignature, 'hex');
    if (
      sigBufA.length !== sigBufB.length ||
      !crypto.timingSafeEqual(sigBufA, sigBufB)
    ) {
      return json({ error: 'Invalid payment signature' }, 400);
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

    // Customer order-confirmation email. Failure does NOT roll back the
    // payment (the payment is real, the DB is the source of truth) but the
    // exact failure is reported back so the UI can show the truth and the
    // operator/customer can act on it.
    const customerInfo = safeJsonParse(confirmedEntity.customer) as
      | { name?: string; email?: string; phone?: string }
      | null;
    const addressInfo = safeJsonParse(confirmedEntity.address) as
      | { line1?: string; city?: string; state?: string; pincode?: string }
      | null;

    let emailSent = false;
    let emailError: string | undefined;
    let emailErrorReason: 'not-configured' | 'smtp-error' | undefined;
    const emailTo = customerInfo?.email;

    if (emailTo) {
      const items = await queryEntities<{ name: string; qty: number; price: number }>(
        'orderItems',
        `PartitionKey eq '${orderId}'`,
      );
      const itemsList =
        items?.map((i) => `  • ${i.name} × ${i.qty} — ₹${(i.price / 100).toLocaleString('en-IN')}`).join('\n') ?? '';
      const shippingAddress = addressInfo
        ? `${addressInfo.line1 ?? ''}\n${addressInfo.city ?? ''}, ${addressInfo.state ?? ''} ${addressInfo.pincode ?? ''}`.trim()
        : '';

      const tpl = renderOrderConfirmation({
        customerName: customerInfo?.name || 'there',
        orderId,
        total: typeof confirmedEntity.total === 'number' ? confirmedEntity.total : 0,
        itemsList,
        shippingAddress,
        storeContactNumber: STORE_CONTACT_NUMBER,
      });
      const emailResult = await sendEmail({
        to: emailTo,
        subject: tpl.subject,
        text: tpl.text,
        html: tpl.html,
      });
      emailSent = emailResult.ok;
      if (!emailResult.ok) {
        emailError = emailResult.detail;
        emailErrorReason = emailResult.reason;
        context.error('Order confirmation email failed:', emailResult.reason, emailResult.detail);
      }
    } else {
      emailError = 'No customer email on order';
      emailErrorReason = 'not-configured';
    }

    return json({
      success: true,
      orderId,
      emailSent,
      emailTo: emailTo ?? null,
      ...(emailSent ? {} : { emailError, emailErrorReason }),
    });
  } catch (err) {
    context.error('verifyPayment error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// Utility: normalise order entity for API response
// ---------------------------------------------------------------------------

function normalizeOrder(entity: OrderEntity): Record<string, unknown> {
  const { partitionKey, rowKey, etag, timestamp, customer, address, status: _status, ...rest } =
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
