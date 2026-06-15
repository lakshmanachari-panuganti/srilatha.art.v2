import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { queryEntitiesAll, queryEntities, upsertEntity } from '../utils/tableStorage';
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

const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
type ReviewStatus = typeof REVIEW_STATUSES[number];

interface ReviewEntity {
  partitionKey: string;       // status
  rowKey: string;             // review id
  productId: string;
  author: string;
  email?: string;
  city?: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verified?: boolean;
  moderatedBy?: string;
  moderatedAt?: string;
  [key: string]: unknown;
}

function toApi(e: ReviewEntity) {
  return {
    id: e.rowKey,
    status: e.partitionKey,
    productId: e.productId,
    author: e.author,
    city: e.city,
    rating: e.rating,
    title: e.title,
    body: e.body,
    date: e.date,
    verified: e.verified === true,
    moderatedBy: e.moderatedBy,
    moderatedAt: e.moderatedAt,
  };
}

async function adminListReviews(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const statusParam = request.query.get('status');
    let all: ReviewEntity[];
    if (statusParam && (REVIEW_STATUSES as readonly string[]).includes(statusParam)) {
      all = await queryEntities<ReviewEntity>('reviews', `PartitionKey eq '${statusParam}'`);
    } else {
      all = await queryEntitiesAll<ReviewEntity>('reviews');
    }
    all.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    return json({ reviews: all.map(toApi), total: all.length });
  } catch (err) {
    context.error('adminListReviews error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

async function adminModerateReview(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const id = request.params.id;
    const action = request.params.action as 'approve' | 'reject';
    if (!id || !['approve', 'reject'].includes(action)) {
      return json({ error: 'id and action (approve|reject) are required' }, 400);
    }

    let existing: ReviewEntity | null = null;
    let oldStatus: ReviewStatus | null = null;
    for (const s of REVIEW_STATUSES) {
      const r = await queryEntities<ReviewEntity>('reviews', `PartitionKey eq '${s}' and RowKey eq '${id}'`);
      if (r.length) { existing = r[0]; oldStatus = s; break; }
    }
    if (!existing || !oldStatus) return json({ error: 'Review not found' }, 404);

    const newStatus: ReviewStatus = action === 'approve' ? 'approved' : 'rejected';
    const { partitionKey: _pk, ...rest } = existing;
    const updated: ReviewEntity = {
      ...rest,
      partitionKey: newStatus,
      moderatedBy: 'sub' in auth ? auth.sub : 'admin',
      moderatedAt: new Date().toISOString(),
    };
    await upsertEntity('reviews', updated);
    // Note: we leave the old-partition record in place rather than deleting,
    // simpler than entity moves. Public read path filters by `approved`.

    return json(toApi(updated));
  } catch (err) {
    context.error('adminModerateReview error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

app.http('adminListReviews', { route: 'mgmt/reviews', methods: ['GET', 'OPTIONS'], authLevel: 'anonymous', handler: adminListReviews });
app.http('adminModerateReview', { route: 'mgmt/reviews/{id}/{action}', methods: ['PATCH', 'POST', 'OPTIONS'], authLevel: 'anonymous', handler: adminModerateReview });
