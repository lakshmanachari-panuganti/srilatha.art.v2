import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { queryEntitiesAll, queryEntities, upsertEntity } from '../utils/tableStorage';
import { requireAdmin } from '../middleware/adminGuard';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function options(): HttpResponseInit { return { status: 204, headers: CORS_HEADERS }; }

const CO_STATUSES = ['new', 'in_review', 'quoted', 'in_progress', 'completed', 'declined'] as const;
type CoStatus = typeof CO_STATUSES[number];

interface CustomOrderEntity {
  partitionKey: string;     // status
  rowKey: string;           // id
  name: string;
  email: string;
  phone: string;
  artType: string;
  budget: string;
  dimensions?: string;
  colorPreferences?: string;
  occasion?: string;
  description: string;
  referenceUrl?: string;
  adminNote?: string;
  createdAt: string;
  [key: string]: unknown;
}

function toApi(e: CustomOrderEntity) {
  const { partitionKey, rowKey, etag: _e, timestamp: _t, ...rest } = e as CustomOrderEntity & { etag?: string; timestamp?: unknown };
  return { id: rowKey, status: partitionKey, ...rest };
}

async function adminListCustomOrders(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const statusFilter = request.query.get('status');
    let all: CustomOrderEntity[];
    if (statusFilter && (CO_STATUSES as readonly string[]).includes(statusFilter)) {
      all = await queryEntities<CustomOrderEntity>('customOrders', `PartitionKey eq '${statusFilter}'`);
    } else {
      all = await queryEntitiesAll<CustomOrderEntity>('customOrders');
    }
    all.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return json({ customOrders: all.map(toApi), total: all.length });
  } catch (err) {
    context.error('adminListCustomOrders error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

async function adminUpdateCustomOrder(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const id = request.params.id;
    if (!id) return json({ error: 'id is required' }, 400);

    let existing: CustomOrderEntity | null = null;
    let oldStatus: CoStatus | null = null;
    for (const s of CO_STATUSES) {
      const r = await queryEntities<CustomOrderEntity>('customOrders', `PartitionKey eq '${s}' and RowKey eq '${id}'`);
      if (r.length) { existing = r[0]; oldStatus = s; break; }
    }
    if (!existing || !oldStatus) return json({ error: 'Custom order not found' }, 404);

    const body = (await request.json()) as { status?: CoStatus; adminNote?: string };
    const newStatus = body.status && (CO_STATUSES as readonly string[]).includes(body.status) ? body.status : oldStatus;

    const { partitionKey: _pk, ...rest } = existing;
    const updated: CustomOrderEntity = {
      ...rest,
      partitionKey: newStatus,
      ...(body.adminNote !== undefined ? { adminNote: body.adminNote } : {}),
    };
    await upsertEntity('customOrders', updated);
    return json(toApi(updated));
  } catch (err) {
    context.error('adminUpdateCustomOrder error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

app.http('adminListCustomOrders', { route: 'mgmt/custom-orders', methods: ['GET', 'OPTIONS'], authLevel: 'anonymous', handler: adminListCustomOrders });
app.http('adminUpdateCustomOrder', { route: 'mgmt/custom-orders/{id}', methods: ['PATCH', 'OPTIONS'], authLevel: 'anonymous', handler: adminUpdateCustomOrder });
