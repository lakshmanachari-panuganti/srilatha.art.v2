import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { odata } from '@azure/data-tables';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { queryEntities, queryEntitiesAll, upsertEntity } from '../utils/tableStorage';

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

const JWT_SECRET = process.env.JWT_SECRET ?? '';
const ELIGIBLE_ORDER_STATUSES = ['delivered', 'shipped', 'confirmed'];

interface CustomerJwtPayload {
  sub: string;
  email: string;
  name?: string;
}

function readCustomerClaims(request: HttpRequest): CustomerJwtPayload | null {
  if (!JWT_SECRET) return null;
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as CustomerJwtPayload;
    if (!decoded?.email) return null;
    return decoded;
  } catch {
    return null;
  }
}

interface ReviewEntity {
  partitionKey: string;       // status: pending | approved | rejected
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

interface OrderEntity {
  partitionKey: string;
  rowKey: string;
  customer: string;       // JSON-serialised
  [key: string]: unknown;
}

interface OrderItemEntity {
  partitionKey: string;   // orderId
  rowKey: string;
  productId: string;
  [key: string]: unknown;
}

function publicReview(e: ReviewEntity) {
  return {
    id: e.rowKey,
    productId: e.productId,
    author: e.author,
    city: e.city,
    rating: e.rating,
    title: e.title,
    body: e.body,
    date: e.date,
    verified: e.verified === true,
  };
}

// ─── GET /api/reviews?productId=...  — public list (approved only) ──────────

async function listPublicReviews(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  try {
    const productId = request.query.get('productId');
    const filter = productId
      ? odata`PartitionKey eq 'approved' and productId eq ${productId}`
      : odata`PartitionKey eq 'approved'`;
    const rows = await queryEntities<ReviewEntity>('reviews', filter);
    rows.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    return json({ reviews: rows.map(publicReview), total: rows.length });
  } catch (err) {
    context.error('listPublicReviews error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ─── POST /api/reviews  — customer-submitted, verified purchaser only ───────

async function hasPurchasedProduct(email: string, productId: string): Promise<boolean> {
  // Pull all orders, parse the customer JSON, keep only orders for this email
  // in a status where the customer can reasonably attest to the product.
  // Small handmade-art catalog — a full scan is fine here; revisit when the
  // orders table outgrows ~10k rows.
  const all = await queryEntitiesAll<OrderEntity>('orders');
  const eligibleOrders = all.filter((o) => {
    if (!ELIGIBLE_ORDER_STATUSES.includes(o.partitionKey)) return false;
    try {
      const customer = JSON.parse(String(o.customer ?? '{}')) as { email?: string };
      return (customer.email ?? '').toLowerCase() === email.toLowerCase();
    } catch {
      return false;
    }
  });
  if (eligibleOrders.length === 0) return false;

  for (const order of eligibleOrders) {
    const items = await queryEntities<OrderItemEntity>(
      'orderItems',
      odata`PartitionKey eq ${order.rowKey}`,
    );
    if (items.some((it) => it.productId === productId)) return true;
  }
  return false;
}

async function submitReview(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  if (!JWT_SECRET) return json({ error: 'Server misconfigured: JWT_SECRET missing' }, 500);

  const claims = readCustomerClaims(request);
  if (!claims) return json({ error: 'Please sign in to leave a review.' }, 401);

  try {
    const body = (await request.json()) as {
      productId?: string;
      rating?: number;
      title?: string;
      body?: string;
      city?: string;
    };

    const productId = String(body.productId ?? '').trim();
    const rating = Math.round(Number(body.rating));
    const title = String(body.title ?? '').trim();
    const text = String(body.body ?? '').trim();
    const city = body.city ? String(body.city).trim() : undefined;

    if (!productId) return json({ error: 'productId is required.' }, 400);
    if (!(rating >= 1 && rating <= 5)) return json({ error: 'Rating must be between 1 and 5.' }, 400);
    if (title.length < 3 || title.length > 120) return json({ error: 'Title must be 3 to 120 characters.' }, 400);
    if (text.length < 10 || text.length > 2000) return json({ error: 'Review must be 10 to 2000 characters.' }, 400);

    // Reject duplicate pending/approved submissions for the same (customer, product).
    const existing = await queryEntities<ReviewEntity>(
      'reviews',
      `(PartitionKey eq 'pending' or PartitionKey eq 'approved') and productId eq '${productId.replace(/'/g, "''")}' and email eq '${claims.email.replace(/'/g, "''")}'`,
    );
    if (existing.length > 0) {
      return json({ error: 'You have already submitted a review for this product.' }, 409);
    }

    const eligible = await hasPurchasedProduct(claims.email, productId);
    if (!eligible) {
      return json(
        { error: 'Reviews are limited to verified customers who have purchased this piece.' },
        403,
      );
    }

    const id = uuidv4();
    const entity: ReviewEntity = {
      partitionKey: 'pending',
      rowKey: id,
      productId,
      author: claims.name?.trim() || claims.email.split('@')[0],
      email: claims.email,
      city,
      rating,
      title,
      body: text,
      date: new Date().toISOString(),
      verified: true,
    };
    await upsertEntity('reviews', entity);

    return json(
      {
        id,
        status: 'pending',
        message: 'Thanks! Your review is pending approval and will appear once a moderator confirms it.',
      },
      201,
    );
  } catch (err) {
    context.error('submitReview error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

app.http('listPublicReviews', {
  route: 'reviews',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: listPublicReviews,
});
app.http('submitReview', {
  route: 'reviews',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: submitReview,
});
