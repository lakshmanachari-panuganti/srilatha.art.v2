import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getEntity, queryEntitiesAll, queryEntities, upsertEntity, deleteEntity } from '../utils/tableStorage';
import { requireAdmin } from '../middleware/adminGuard';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function options(): HttpResponseInit { return { status: 204, headers: CORS_HEADERS }; }

interface CouponEntity {
  partitionKey: string;       // 'coupon'
  rowKey: string;             // CODE (uppercase)
  type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';
  value: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  startDate?: string;
  endDate?: string;
  usageLimit?: number;
  currentUsage?: number;
  active?: boolean;
  description?: string;
  promoteInBanner?: boolean;
  createdAt: string;
  createdBy: string;
}

function toApi(c: CouponEntity) {
  return {
    code: c.rowKey,
    type: c.type,
    value: c.value,
    minOrderAmount: c.minOrderAmount,
    maxDiscount: c.maxDiscount,
    startDate: c.startDate,
    endDate: c.endDate,
    usageLimit: c.usageLimit,
    currentUsage: c.currentUsage ?? 0,
    active: c.active !== false,
    description: c.description,
    promoteInBanner: c.promoteInBanner === true,
    createdAt: c.createdAt,
  };
}

async function adminListCoupons(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const all = await queryEntitiesAll<CouponEntity>('coupons');
    return json({ coupons: all.map(toApi) });
  } catch (err) {
    context.error('adminListCoupons error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

async function adminCreateCoupon(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const body = (await request.json()) as Partial<CouponEntity> & { code?: string };
    if (!body.code || !body.type) return json({ error: 'code and type are required' }, 400);

    const code = body.code.toUpperCase().trim();
    const existing = await getEntity<CouponEntity>('coupons', 'coupon', code);
    if (existing) return json({ error: 'Coupon code already exists' }, 409);

    const entity: CouponEntity = {
      partitionKey: 'coupon',
      rowKey: code,
      type: body.type,
      value: Number(body.value ?? 0),
      minOrderAmount: body.minOrderAmount ? Number(body.minOrderAmount) : undefined,
      maxDiscount: body.maxDiscount ? Number(body.maxDiscount) : undefined,
      startDate: body.startDate,
      endDate: body.endDate,
      usageLimit: body.usageLimit ? Number(body.usageLimit) : undefined,
      currentUsage: 0,
      active: body.active !== false,
      description: body.description,
      promoteInBanner: body.promoteInBanner === true,
      createdAt: new Date().toISOString(),
      createdBy: 'sub' in auth ? auth.sub : 'admin',
    };
    await upsertEntity('coupons', entity);
    return json(toApi(entity), 201);
  } catch (err) {
    context.error('adminCreateCoupon error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

async function adminUpdateCoupon(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const code = request.params.code?.toUpperCase();
    if (!code) return json({ error: 'code is required' }, 400);
    const existing = await getEntity<CouponEntity>('coupons', 'coupon', code);
    if (!existing) return json({ error: 'Coupon not found' }, 404);
    const body = (await request.json()) as Partial<CouponEntity>;
    const updated: CouponEntity = { ...existing, ...body, partitionKey: 'coupon', rowKey: code };
    await upsertEntity('coupons', updated);
    return json(toApi(updated));
  } catch (err) {
    context.error('adminUpdateCoupon error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

async function adminDeleteCoupon(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const code = request.params.code?.toUpperCase();
    if (!code) return json({ error: 'code is required' }, 400);
    await deleteEntity('coupons', 'coupon', code);
    return json({ success: true });
  } catch (err) {
    context.error('adminDeleteCoupon error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

async function adminCouponRedemptions(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const code = request.params.code?.toUpperCase();
    if (!code) return json({ error: 'code is required' }, 400);
    const redemptions = await queryEntities('couponRedemptions', `PartitionKey eq '${code}'`);
    return json({ code, total: redemptions.length, redemptions });
  } catch (err) {
    context.error('adminCouponRedemptions error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// OPTIONS lives only on the first handler per route (Azure Functions silently
// breaks routing when the same (route, method) is registered twice).
app.http('adminListCoupons',         { route: 'mgmt/coupons',                       methods: ['GET', 'OPTIONS'], authLevel: 'anonymous', handler: adminListCoupons });
app.http('adminCreateCoupon',        { route: 'mgmt/coupons',                       methods: ['POST'],           authLevel: 'anonymous', handler: adminCreateCoupon });
app.http('adminUpdateCoupon',        { route: 'mgmt/coupons/{code}',                methods: ['PATCH', 'OPTIONS'], authLevel: 'anonymous', handler: adminUpdateCoupon });
app.http('adminDeleteCoupon',        { route: 'mgmt/coupons/{code}',                methods: ['DELETE'],         authLevel: 'anonymous', handler: adminDeleteCoupon });
app.http('adminCouponRedemptions',   { route: 'mgmt/coupons/{code}/redemptions',    methods: ['GET', 'OPTIONS'], authLevel: 'anonymous', handler: adminCouponRedemptions });
