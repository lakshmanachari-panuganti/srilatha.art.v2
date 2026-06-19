import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getEntity, queryEntitiesAll } from '../utils/tableStorage';

// ---------------------------------------------------------------------------
// Constants & helpers (mirrors existing convention in orders.ts/products.ts)
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function options(): HttpResponseInit {
  return { status: 204, headers: CORS_HEADERS };
}

// ---------------------------------------------------------------------------
// Coupon entity (Table: coupons, partitionKey: 'coupon', rowKey: <CODE>)
// ---------------------------------------------------------------------------

interface CouponEntity {
  partitionKey: string;
  rowKey: string;          // uppercase coupon code
  type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';
  value: number;           // percent (1–100) for PERCENTAGE, paise for FIXED_AMOUNT, ignored for FREE_SHIPPING
  minOrderAmount?: number; // paise
  maxDiscount?: number;    // paise (cap for PERCENTAGE)
  startDate?: string;      // ISO 8601
  endDate?: string;        // ISO 8601
  usageLimit?: number;
  currentUsage?: number;
  active?: boolean;
  description?: string;
  promoteInBanner?: boolean;
}

/**
 * Pure function — given a coupon and a subtotal, return the discount in paise.
 * Exported so the same logic runs at both /validate time and /orders create time.
 */
export function computeCouponDiscount(coupon: CouponEntity, subtotal: number, shipping: number) {
  if (coupon.minOrderAmount && subtotal < coupon.minOrderAmount) {
    return { valid: false, reason: 'MIN_ORDER', message: `Minimum order ₹${coupon.minOrderAmount / 100} required.`, discount: 0, freeShipping: false };
  }
  if (coupon.active === false) {
    return { valid: false, reason: 'INACTIVE', message: 'This coupon is no longer active.', discount: 0, freeShipping: false };
  }
  const now = Date.now();
  if (coupon.startDate && new Date(coupon.startDate).getTime() > now) {
    return { valid: false, reason: 'NOT_STARTED', message: 'This coupon is not yet active.', discount: 0, freeShipping: false };
  }
  if (coupon.endDate && new Date(coupon.endDate).getTime() < now) {
    return { valid: false, reason: 'EXPIRED', message: 'This coupon has expired.', discount: 0, freeShipping: false };
  }
  if (coupon.usageLimit && (coupon.currentUsage ?? 0) >= coupon.usageLimit) {
    return { valid: false, reason: 'EXHAUSTED', message: 'This coupon has reached its usage limit.', discount: 0, freeShipping: false };
  }

  if (coupon.type === 'PERCENTAGE') {
    let discount = Math.floor((subtotal * coupon.value) / 100);
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
    return { valid: true, discount, freeShipping: false };
  }
  if (coupon.type === 'FIXED_AMOUNT') {
    return { valid: true, discount: Math.min(coupon.value, subtotal), freeShipping: false };
  }
  if (coupon.type === 'FREE_SHIPPING') {
    return { valid: true, discount: 0, freeShipping: shipping > 0 };
  }
  return { valid: false, reason: 'UNSUPPORTED_TYPE', message: 'Coupon type not supported.', discount: 0, freeShipping: false };
}

// ---------------------------------------------------------------------------
// GET /api/coupons/active  — for marketing banner / sale page
// ---------------------------------------------------------------------------

async function activeCoupons(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();

  try {
    const all = await queryEntitiesAll<CouponEntity>('coupons');
    const now = Date.now();
    const active = all.filter(c => {
      if (c.active === false) return false;
      if (c.startDate && new Date(c.startDate).getTime() > now) return false;
      if (c.endDate && new Date(c.endDate).getTime() < now) return false;
      if (c.usageLimit && (c.currentUsage ?? 0) >= c.usageLimit) return false;
      return c.promoteInBanner === true;
    }).map(c => ({
      code: c.rowKey,
      type: c.type,
      value: c.value,
      description: c.description ?? '',
      minOrderAmount: c.minOrderAmount ?? 0,
    }));

    return json({ coupons: active });
  } catch (err) {
    context.error('activeCoupons error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/coupons/validate  — UX preview of discount before checkout
// Body: { code: string; subtotal: number; shipping: number }
// ---------------------------------------------------------------------------

async function validateCoupon(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();

  try {
    const body = (await request.json()) as { code?: string; subtotal?: number; shipping?: number };
    if (!body.code || typeof body.subtotal !== 'number') {
      return json({ error: 'code and subtotal (paise) are required' }, 400);
    }

    const code = body.code.toUpperCase().trim();
    const coupon = await getEntity<CouponEntity>('coupons', 'coupon', code);

    if (!coupon) {
      return json({ valid: false, reason: 'INVALID', message: 'Coupon code not recognised.' });
    }

    const result = computeCouponDiscount(coupon, body.subtotal, body.shipping ?? 0);
    if (!result.valid) return json(result);

    return json({
      valid: true,
      code,
      type: coupon.type,
      discount: result.discount,
      freeShipping: result.freeShipping,
      description: coupon.description ?? '',
    });
  } catch (err) {
    context.error('validateCoupon error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// Internal: fetch coupon by code (used by orders.createOrder).
// Not registered as an HTTP route — exported for in-process call.
// ---------------------------------------------------------------------------

export async function getCouponByCode(code: string): Promise<CouponEntity | null> {
  return getEntity<CouponEntity>('coupons', 'coupon', code.toUpperCase().trim());
}

// ---------------------------------------------------------------------------
// Register HTTP routes
// ---------------------------------------------------------------------------

app.http('activeCoupons', {
  route: 'coupons/active',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: activeCoupons,
});

app.http('validateCoupon', {
  route: 'coupons/validate',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: validateCoupon,
});
