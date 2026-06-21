import { wrapCors } from '../utils/cors';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { odata } from '@azure/data-tables';
import { queryEntities, queryEntitiesAll, upsertEntity, deleteEntity } from '../utils/tableStorage';
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

const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
type OrderStatus = typeof ORDER_STATUSES[number];

interface OrderEntity {
  partitionKey: string;
  rowKey: string;
  status: string;
  razorpayOrderId: string;
  customer: string;
  address: string;
  subtotal: number;
  shipping: number;
  discount?: number;
  total: number;
  createdAt: string;
  couponCode?: string;
  notes?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  [key: string]: unknown;
}

function safeJson<T = unknown>(v: unknown): T | null {
  if (typeof v !== 'string') return (v as T) ?? null;
  try { return JSON.parse(v) as T; } catch { return null; }
}

function toApi(entity: OrderEntity) {
  const { partitionKey, rowKey, etag: _e, timestamp: _t, customer, address, status: _status, ...rest } = entity as OrderEntity & { etag?: string; timestamp?: unknown };
  return {
    orderId: rowKey,
    status: partitionKey,
    customer: safeJson(customer),
    address: safeJson(address),
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// GET /api/admin/orders — list, filter by status/date, search by customer
// ---------------------------------------------------------------------------

async function adminListOrders(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = await requireAdmin(request);
  if ('status' in auth) return auth;

  try {
    const statusFilter = request.query.get('status');
    const search = request.query.get('search')?.toLowerCase();
    const page = Math.max(1, parseInt(request.query.get('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.get('limit') ?? '50', 10)));

    let all: OrderEntity[];
    if (statusFilter) {
      all = await queryEntities<OrderEntity>('orders', odata`PartitionKey eq ${statusFilter}`);
    } else {
      all = await queryEntitiesAll<OrderEntity>('orders');
    }

    // Sort newest first
    all.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

    let filtered = all;
    if (search) {
      filtered = all.filter(o => {
        const c = safeJson<{ name: string; email: string; phone: string }>(o.customer);
        if (!c) return false;
        return (
          c.name?.toLowerCase().includes(search) ||
          c.email?.toLowerCase().includes(search) ||
          c.phone?.includes(search) ||
          o.rowKey.toLowerCase().includes(search)
        );
      });
    }

    const total = filtered.length;
    const start = (page - 1) * limit;
    const orders = filtered.slice(start, start + limit).map(toApi);
    return json({ orders, total, page });
  } catch (err) {
    context.error('adminListOrders error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/orders/{id} — single order with items and events
// ---------------------------------------------------------------------------

async function adminGetOrder(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = await requireAdmin(request);
  if ('status' in auth) return auth;

  try {
    const id = request.params.id;
    if (!id) return json({ error: 'id is required' }, 400);

    let entity: OrderEntity | null = null;
    for (const s of ORDER_STATUSES) {
      const r = await queryEntities<OrderEntity>('orders', odata`PartitionKey eq ${s} and RowKey eq ${id}`);
      if (r.length) { entity = r[0]; break; }
    }
    if (!entity) return json({ error: 'Order not found' }, 404);

    const items = await queryEntities('orderItems', odata`PartitionKey eq ${id}`);
    const events = await queryEntities('orderEvents', odata`PartitionKey eq ${id}`);

    return json({ ...toApi(entity), items, events });
  } catch (err) {
    context.error('adminGetOrder error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/orders/{id}/status — transition status with note
// ---------------------------------------------------------------------------

async function adminUpdateStatus(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = await requireAdmin(request);
  if ('status' in auth) return auth;

  try {
    const id = request.params.id;
    if (!id) return json({ error: 'id is required' }, 400);

    const body = (await request.json()) as { status?: OrderStatus; note?: string; trackingNumber?: string; trackingUrl?: string };
    if (!body.status || !ORDER_STATUSES.includes(body.status)) {
      return json({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` }, 400);
    }

    let entity: OrderEntity | null = null;
    let oldStatus: OrderStatus | null = null;
    for (const s of ORDER_STATUSES) {
      const r = await queryEntities<OrderEntity>('orders', odata`PartitionKey eq ${s} and RowKey eq ${id}`);
      if (r.length) { entity = r[0]; oldStatus = s; break; }
    }
    if (!entity || !oldStatus) return json({ error: 'Order not found' }, 404);

    const { partitionKey: _pk, status: _s, ...rest } = entity;
    const updated: OrderEntity = {
      ...rest,
      partitionKey: body.status,
      status: body.status,
      ...(body.trackingNumber ? { trackingNumber: body.trackingNumber } : {}),
      ...(body.trackingUrl ? { trackingUrl: body.trackingUrl } : {}),
    };
    await upsertEntity('orders', updated);

    if (oldStatus !== body.status) {
      await deleteEntity('orders', oldStatus, id);
    }

    await upsertEntity('orderEvents', {
      partitionKey: id,
      rowKey: `status-${Date.now()}`,
      eventType: 'status_changed',
      from: oldStatus,
      to: body.status,
      note: body.note ?? '',
      changedBy: 'sub' in auth ? auth.sub : 'admin',
      timestamp: new Date().toISOString(),
    });

    return json({ success: true, status: body.status });
  } catch (err) {
    context.error('adminUpdateStatus error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/orders/{id}/notes — append an admin note
// ---------------------------------------------------------------------------

async function adminAddNote(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = await requireAdmin(request);
  if ('status' in auth) return auth;

  try {
    const id = request.params.id;
    if (!id) return json({ error: 'id is required' }, 400);
    const body = (await request.json()) as { note?: string };
    if (!body.note) return json({ error: 'note is required' }, 400);

    await upsertEntity('orderEvents', {
      partitionKey: id,
      rowKey: `note-${Date.now()}`,
      eventType: 'note',
      note: body.note,
      changedBy: 'sub' in auth ? auth.sub : 'admin',
      timestamp: new Date().toISOString(),
    });

    return json({ success: true });
  } catch (err) {
    context.error('adminAddNote error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/orders/bulk-status — apply same status to many orders
// ---------------------------------------------------------------------------

async function adminBulkStatus(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = await requireAdmin(request);
  if ('status' in auth) return auth;

  try {
    const body = (await request.json()) as { orderIds?: string[]; status?: OrderStatus };
    if (!body.orderIds?.length || !body.status || !ORDER_STATUSES.includes(body.status)) {
      return json({ error: 'orderIds[] and a valid status are required' }, 400);
    }

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of body.orderIds) {
      try {
        // Reuse the single-update path by faking a request — keep simple inline here:
        let entity: OrderEntity | null = null;
        let oldStatus: OrderStatus | null = null;
        for (const s of ORDER_STATUSES) {
          const r = await queryEntities<OrderEntity>('orders', odata`PartitionKey eq ${s} and RowKey eq ${id}`);
          if (r.length) { entity = r[0]; oldStatus = s; break; }
        }
        if (!entity || !oldStatus) {
          results.push({ id, ok: false, error: 'Not found' });
          continue;
        }
        const { partitionKey: _pk, status: _s, ...rest } = entity;
        await upsertEntity('orders', { ...rest, partitionKey: body.status, status: body.status });
        if (oldStatus !== body.status) await deleteEntity('orders', oldStatus, id);
        await upsertEntity('orderEvents', {
          partitionKey: id,
          rowKey: `status-${Date.now()}`,
          eventType: 'status_changed',
          from: oldStatus,
          to: body.status,
          note: 'bulk update',
          changedBy: 'sub' in auth ? auth.sub : 'admin',
          timestamp: new Date().toISOString(),
        });
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: String(e) });
      }
    }
    return json({ results });
  } catch (err) {
    context.error('adminBulkStatus error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

app.http('adminListOrders', {
  route: 'mgmt/orders',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(adminListOrders),
});

app.http('adminGetOrder', {
  route: 'mgmt/orders/{id}',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(adminGetOrder),
});

app.http('adminUpdateStatus', {
  route: 'mgmt/orders/{id}/status',
  methods: ['PATCH', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(adminUpdateStatus),
});

app.http('adminAddNote', {
  route: 'mgmt/orders/{id}/notes',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(adminAddNote),
});

app.http('adminBulkStatus', {
  route: 'mgmt/orders/bulk-status',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(adminBulkStatus),
});
