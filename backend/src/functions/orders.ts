import { wrapCors } from '../utils/cors';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { odata } from '@azure/data-tables';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getTableClient, upsertEntity, queryEntities, queryEntitiesAll, deleteEntity, getEntity } from '../utils/tableStorage';
import { computeCouponDiscount, getCouponByCode } from './coupons';
import { verifyCustomerToken } from './customerAuth';
import { sendEmail } from '../utils/email';
import { renderOrderConfirmation } from '../templates/emailTemplates';
import { STORE_CONTACT_NUMBER } from './whatsapp';
import { recordIssue, resolveOpenIssues } from '../utils/issueLog';

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

interface ProductEntity {
  partitionKey: string;
  rowKey: string;
  name: string;
  price: number;     // paise — authoritative
  active?: boolean;
  inStock?: boolean;
  [key: string]: unknown;
}

const MAX_ITEMS_PER_ORDER = 50;
const MAX_QTY_PER_ITEM = 99;

// TTL for the per-order session token returned from createOrder and required
// by verifyPayment. 1 hour is more than enough for the user to complete the
// Razorpay flow and well under the order's pending-cleanup window.
const ORDER_TOKEN_TTL_SECONDS = 60 * 60;
const ORDER_TOKEN_PURPOSE = 'order-session';

interface OrderTokenClaims {
  purpose: typeof ORDER_TOKEN_PURPOSE;
  orderId: string;
  razorpayOrderId: string;
}

/**
 * Look up the catalog product by id (RowKey). Cross-partition because the
 * products table partitions by category, which the client doesn't send.
 * Returns null if missing or soft-deleted (`active === false`).
 */
async function findProductById(productId: string): Promise<ProductEntity | null> {
  const results = await queryEntities<ProductEntity>(
    'products',
    odata`RowKey eq ${productId}`,
  );
  const product = results?.[0];
  if (!product) return null;
  if (product.active === false) return null;
  return product;
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
    if (items.length > MAX_ITEMS_PER_ORDER) {
      return json({ error: `Too many items (max ${MAX_ITEMS_PER_ORDER}).` }, 400);
    }

    // Resolve each item against the catalog. The client-supplied `price` and
    // `name` fields are IGNORED — taking them on trust let an attacker
    // submit an order with `price: 100` (₹1 in paise) and pay ₹1 for any
    // product. Quantities are also clamped server-side.
    const resolved: OrderItem[] = [];
    for (const raw of items) {
      const productId = String(raw?.productId ?? '').trim();
      if (!productId) {
        return json({ error: 'Each item must include a productId.' }, 400);
      }
      const qtyRaw = Number(raw?.qty);
      if (!Number.isFinite(qtyRaw) || qtyRaw < 1) {
        return json({ error: `Invalid quantity for item ${productId}.` }, 400);
      }
      const qty = Math.min(MAX_QTY_PER_ITEM, Math.max(1, Math.floor(qtyRaw)));

      const product = await findProductById(productId);
      if (!product) {
        return json(
          { error: `Product ${productId} is unavailable. Please refresh your cart.` },
          400,
        );
      }
      const price = Number(product.price);
      if (!Number.isFinite(price) || price < 0) {
        context.error(`Product ${productId} has invalid price ${product.price}`);
        return json({ error: 'Catalog data error. Please try again later.' }, 500);
      }

      resolved.push({
        productId,
        name: String(product.name ?? ''),
        qty,
        price,
      });
    }

    // Calculate amounts (paise) from server-resolved prices only.
    const subtotal = resolved.reduce((sum, item) => sum + item.qty * item.price, 0);
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
      context.error('Razorpay order creation failed', razorpayRes.status, errBody);

      // Razorpay error envelope: { error: { code, description, reason, source, step } }
      let code: string | undefined;
      let description: string | undefined;
      let reason: string | undefined;
      try {
        const parsed = JSON.parse(errBody) as {
          error?: { code?: string; description?: string; reason?: string };
        };
        code = parsed.error?.code;
        description = parsed.error?.description;
        reason = parsed.error?.reason;
      } catch {
        // Non-JSON body (HTML error page, empty, etc.) — fall through to raw text.
      }

      const message =
        description ??
        (errBody ? errBody.slice(0, 300) : `Razorpay returned HTTP ${razorpayRes.status}`);

      // Severity escalates to 'critical' on 401 — that's almost always a
      // bad/missing key, which blocks every checkout site-wide.
      void recordIssue({
        service: 'razorpay',
        severity: razorpayRes.status === 401 ? 'critical' : 'error',
        message: `Razorpay create-order failed (HTTP ${razorpayRes.status}): ${message.slice(0, 200)}`,
        detail: errBody,
        orderId,
        fingerprint: 'razorpay:create-order',
      });

      return json(
        {
          error: message,
          razorpayStatus: razorpayRes.status,
          ...(code ? { razorpayCode: code } : {}),
          ...(reason ? { razorpayReason: reason } : {}),
        },
        502,
      );
    }

    // Success path: self-heal any open create-order issues so a transient
    // outage doesn't leave a stale red badge.
    void resolveOpenIssues({ service: 'razorpay', fingerprint: 'razorpay:create-order' });

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

    // Save order items to Table Storage using server-resolved values, so the
    // persisted record matches what was actually charged.
    await Promise.all(
      resolved.map((item, index) =>
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

    // Mint a short-lived signed session token. The frontend must echo it back
    // to verifyPayment, where the server checks that the token's orderId +
    // razorpayOrderId match the request. This is what gates an anonymous
    // caller from flipping arbitrary orders to 'confirmed': they would need a
    // token issued for that specific order.
    const orderToken = jwt.sign(
      {
        purpose: ORDER_TOKEN_PURPOSE,
        orderId,
        razorpayOrderId,
      } satisfies OrderTokenClaims,
      JWT_SECRET,
      { expiresIn: ORDER_TOKEN_TTL_SECONDS },
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
      orderToken,
      orderTokenExpiresIn: ORDER_TOKEN_TTL_SECONDS,
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

    // verifyCustomerToken checks the signature, algorithm, expiry, AND
    // the server-side tokenVersion — so a logged-out / password-changed
    // token is rejected even before its natural expiry.
    const verified = await verifyCustomerToken(token);
    if (!verified) {
      return json({ error: 'Invalid or expired token' }, 401);
    }
    const callerEmail = verified.claims.email.toLowerCase();

    const orderId = request.params.orderId;
    if (!orderId) {
      return json({ error: 'orderId is required' }, 400);
    }

    // Search across all status partitions
    let orderEntity: OrderEntity | null = null;

    for (const status of ORDER_STATUSES) {
      const filter = odata`PartitionKey eq ${status} and RowKey eq ${orderId}`;
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
    const itemsFilter = odata`PartitionKey eq ${orderId}`;
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
// GET /api/users/me/orders  – the signed-in customer's order history
// ---------------------------------------------------------------------------

async function listMyOrders(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();

  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return json({ error: 'Authorization header missing or malformed' }, 401);
    }
    const verified = await verifyCustomerToken(token);
    if (!verified) {
      return json({ error: 'Invalid or expired token' }, 401);
    }
    const callerEmail = verified.claims.email.toLowerCase();

    // Orders partition by status, not by customer — and the customer email
    // lives inside the JSON-serialised `customer` blob, which isn't a Table
    // Storage filterable field. So we scan and filter in-process. Fine for
    // the current catalog volume; add an `ordersByCustomer` index keyed on
    // email at verifyPayment time when this table grows past a few thousand.
    const all = await queryEntitiesAll<OrderEntity>('orders');
    const mine = all.filter((o) => {
      const ownerEmail =
        (safeJsonParse(o.customer) as { email?: string } | null)?.email?.toLowerCase();
      return ownerEmail === callerEmail;
    });

    // Newest first by createdAt (ISO 8601 string compares lexicographically).
    mine.sort((a, b) =>
      String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
    );

    return json({
      orders: mine.map(normalizeOrder),
      total: mine.length,
    });
  } catch (err) {
    context.error('listMyOrders error', err);
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

    // Caller proof of possession: the order session token minted at
    // createOrder time. Guest checkout has no customer JWT, so this is what
    // ties verify-payment to a specific order — without it, a valid Razorpay
    // signature from an attacker's own payment could be replayed against a
    // victim's orderId.
    const authHeader = request.headers.get('Authorization') ?? '';
    const orderToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!orderToken) {
      return json({ error: 'Order session token required.' }, 401);
    }
    let tokenClaims: OrderTokenClaims;
    try {
      tokenClaims = jwt.verify(orderToken, JWT_SECRET, {
        algorithms: ['HS256'],
      }) as OrderTokenClaims;
    } catch {
      return json({ error: 'Order session expired. Please retry checkout.' }, 401);
    }
    if (
      tokenClaims?.purpose !== ORDER_TOKEN_PURPOSE ||
      tokenClaims.orderId !== orderId
    ) {
      return json({ error: 'Order session token does not match this order.' }, 401);
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
    // The token's razorpayOrderId is the server-of-record from createOrder.
    // The body's razorpayOrderId must also match. We check the token first so
    // an attacker can't substitute a stale token from a different order.
    if (tokenClaims.razorpayOrderId !== razorpayOrderId) {
      return json({ error: 'Order/payment mismatch' }, 400);
    }

    // Find the order in 'pending' partition first, then others
    let orderEntity: OrderEntity | null = null;

    for (const status of ORDER_STATUSES) {
      const filter = odata`PartitionKey eq ${status} and RowKey eq ${orderId}`;
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
        odata`PartitionKey eq ${orderId}`,
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
  handler: wrapCors(createOrder),
});

app.http('getOrder', {
  route: 'orders/{orderId}',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(getOrder),
});

app.http('listMyOrders', {
  route: 'users/me/orders',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(listMyOrders),
});

app.http('verifyPayment', {
  route: 'orders/{orderId}/verify-payment',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(verifyPayment),
});
