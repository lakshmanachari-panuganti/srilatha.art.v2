import { wrapCors } from '../utils/cors';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { odata } from '@azure/data-tables';
import { queryEntities, queryEntitiesAll } from '../utils/tableStorage';
import { resolveIssueById, IssueEntity } from '../utils/issueLog';
import { requireAdmin } from '../middleware/adminGuard';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function options(): HttpResponseInit { return { status: 204, headers: CORS_HEADERS }; }

const TABLE = 'systemIssues';

interface IssueDto {
  id: string;
  status: 'open' | 'resolved';
  service: string;
  severity: 'critical' | 'error' | 'warning';
  message: string;
  detail?: string;
  orderId?: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

function toDto(e: IssueEntity): IssueDto {
  return {
    id: e.rowKey,
    status: e.partitionKey,
    service: e.service,
    severity: e.severity,
    message: e.message,
    detail: e.detail,
    orderId: e.orderId,
    count: e.count ?? 1,
    firstSeenAt: e.firstSeenAt,
    lastSeenAt: e.lastSeenAt,
    resolvedAt: e.resolvedAt,
    resolvedBy: e.resolvedBy,
  };
}

// ---------------------------------------------------------------------------
// GET /api/mgmt/issues?status=&service=&severity=&since=&limit=
// ---------------------------------------------------------------------------
async function listIssues(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = await requireAdmin(request);
  if ('status' in auth) return auth;

  try {
    const status = request.query.get('status');           // 'open' | 'resolved' | undefined
    const service = request.query.get('service');         // single service filter
    const severity = request.query.get('severity');       // single severity filter
    const since = request.query.get('since');             // ISO string
    const limitRaw = request.query.get('limit');
    const limit = Math.min(500, Math.max(1, Number.parseInt(limitRaw ?? '100', 10) || 100));

    // PartitionKey makes the status filter cheap; everything else applies in-process.
    let rows: IssueEntity[];
    if (status === 'open' || status === 'resolved') {
      rows = await queryEntities<IssueEntity>(TABLE, odata`PartitionKey eq ${status}`);
    } else {
      rows = await queryEntitiesAll<IssueEntity>(TABLE);
    }

    if (service) rows = rows.filter(r => r.service === service);
    if (severity) rows = rows.filter(r => r.severity === severity);
    if (since) rows = rows.filter(r => (r.lastSeenAt ?? '') >= since);

    // Newest first by lastSeenAt.
    rows.sort((a, b) => String(b.lastSeenAt ?? '').localeCompare(String(a.lastSeenAt ?? '')));

    const total = rows.length;
    const sliced = rows.slice(0, limit);

    // Trends: simple counts grouped by service + severity over the returned set,
    // plus a 7-day daily series of open+resolved combined. Cheap to compute
    // here once vs. having the client crunch the table.
    const byService: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const r of rows) {
      byService[r.service] = (byService[r.service] ?? 0) + 1;
      bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
    }

    return json({
      issues: sliced.map(toDto),
      total,
      returned: sliced.length,
      summary: { byService, bySeverity },
    });
  } catch (err) {
    context.error('listIssues error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// GET /api/mgmt/issues/count?status=open    — for the sidebar badge
// ---------------------------------------------------------------------------
async function countIssues(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = await requireAdmin(request);
  if ('status' in auth) return auth;

  try {
    const status = request.query.get('status') ?? 'open';
    if (status !== 'open' && status !== 'resolved') {
      return json({ error: 'status must be open or resolved' }, 400);
    }
    const rows = await queryEntities<IssueEntity>(TABLE, odata`PartitionKey eq ${status}`);
    return json({ status, count: rows.length });
  } catch (err) {
    context.error('countIssues error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/mgmt/issues/:id/resolve
// ---------------------------------------------------------------------------
async function resolveIssue(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = await requireAdmin(request);
  if ('status' in auth) return auth;

  try {
    const id = request.params.id;
    if (!id) return json({ error: 'id is required' }, 400);

    const ok = await resolveIssueById({ id, resolvedBy: 'sub' in auth ? auth.sub : 'admin' });
    if (!ok) return json({ error: 'Issue not found or already resolved' }, 404);
    return json({ success: true, id });
  } catch (err) {
    context.error('resolveIssue error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

app.http('listIssues', {
  route: 'mgmt/issues',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(listIssues),
});

app.http('countIssues', {
  route: 'mgmt/issues/count',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(countIssues),
});

app.http('resolveIssue', {
  route: 'mgmt/issues/{id}/resolve',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(resolveIssue),
});
