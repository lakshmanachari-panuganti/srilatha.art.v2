import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { getEntity, queryEntitiesAll, upsertEntity, deleteEntity } from '../utils/tableStorage';
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

interface AnnouncementEntity {
  partitionKey: string;       // 'announcement'
  rowKey: string;             // uuid
  message: string;
  cta?: string;               // optional CTA label (e.g. "Shop Now")
  link?: string;              // optional CTA url (e.g. "/shop")
  startDate?: string;
  endDate?: string;
  active: boolean;
  priority?: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

function toApi(e: AnnouncementEntity) {
  return {
    id: e.rowKey,
    message: e.message,
    cta: e.cta,
    link: e.link,
    startDate: e.startDate,
    endDate: e.endDate,
    active: e.active !== false,
    priority: e.priority ?? 0,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

// ─── Public GET /api/announcements — only active, current ────────────────────

async function getPublicAnnouncements(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  try {
    const all = await queryEntitiesAll<AnnouncementEntity>('config');
    const now = Date.now();
    const active = all
      .filter(a => a.partitionKey === 'announcement' && a.active !== false)
      .filter(a => !a.startDate || new Date(a.startDate).getTime() <= now)
      .filter(a => !a.endDate || new Date(a.endDate).getTime() >= now)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .map(toApi);
    return json({ announcements: active });
  } catch (err) {
    context.error('getPublicAnnouncements error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ─── Admin ──────────────────────────────────────────────────────────────────

async function adminListAnnouncements(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const all = await queryEntitiesAll<AnnouncementEntity>('config');
    return json({ announcements: all.filter(a => a.partitionKey === 'announcement').map(toApi) });
  } catch (err) {
    context.error('adminListAnnouncements error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

async function adminCreateAnnouncement(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const body = (await request.json()) as Partial<AnnouncementEntity>;
    if (!body.message) return json({ error: 'message is required' }, 400);
    const id = uuidv4();
    const now = new Date().toISOString();
    const entity: AnnouncementEntity = {
      partitionKey: 'announcement',
      rowKey: id,
      message: body.message,
      cta: body.cta,
      link: body.link,
      startDate: body.startDate,
      endDate: body.endDate,
      active: body.active !== false,
      priority: body.priority ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    await upsertEntity('config', entity);
    return json(toApi(entity), 201);
  } catch (err) {
    context.error('adminCreateAnnouncement error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

async function adminUpdateAnnouncement(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const id = request.params.id;
    if (!id) return json({ error: 'id is required' }, 400);
    const existing = await getEntity<AnnouncementEntity>('config', 'announcement', id);
    if (!existing) return json({ error: 'Announcement not found' }, 404);
    const body = (await request.json()) as Partial<AnnouncementEntity>;
    const updated: AnnouncementEntity = { ...existing, ...body, partitionKey: 'announcement', rowKey: id, updatedAt: new Date().toISOString() };
    await upsertEntity('config', updated);
    return json(toApi(updated));
  } catch (err) {
    context.error('adminUpdateAnnouncement error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

async function adminDeleteAnnouncement(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const id = request.params.id;
    if (!id) return json({ error: 'id is required' }, 400);
    await deleteEntity('config', 'announcement', id);
    return json({ success: true });
  } catch (err) {
    context.error('adminDeleteAnnouncement error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

app.http('getPublicAnnouncements',  { route: 'announcements',          methods: ['GET', 'OPTIONS'],  authLevel: 'anonymous', handler: getPublicAnnouncements });
// OPTIONS lives only on the first handler per route — see comment in productAdmin.ts.
app.http('adminListAnnouncements',  { route: 'mgmt/announcements',     methods: ['GET', 'OPTIONS'],  authLevel: 'anonymous', handler: adminListAnnouncements });
app.http('adminCreateAnnouncement', { route: 'mgmt/announcements',     methods: ['POST'],            authLevel: 'anonymous', handler: adminCreateAnnouncement });
app.http('adminUpdateAnnouncement', { route: 'mgmt/announcements/{id}', methods: ['PATCH', 'OPTIONS'], authLevel: 'anonymous', handler: adminUpdateAnnouncement });
app.http('adminDeleteAnnouncement', { route: 'mgmt/announcements/{id}', methods: ['DELETE'],         authLevel: 'anonymous', handler: adminDeleteAnnouncement });
