import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { odata } from '@azure/data-tables';
import { getTableClient, queryEntities, queryEntitiesAll } from '../utils/tableStorage';

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

// ---------------------------------------------------------------------------
// Product type
// ---------------------------------------------------------------------------

interface Product {
  partitionKey: string;  // category
  rowKey: string;        // productId
  slug: string;
  name: string;
  description?: string;
  shortDesc?: string;
  price: number;
  originalPrice?: number;
  images?: string;
  tags?: string;
  material?: string;
  careInstructions?: string;
  dimensions?: string;
  rating?: number;
  reviewCount?: number;
  inStock: boolean;
  stockCount?: number;
  isBestSeller?: boolean;
  isNewArrival?: boolean;
  isSale?: boolean;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  category?: string;
  [key: string]: unknown;
}

function safeJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

// ---------------------------------------------------------------------------
// GET /api/products
// ---------------------------------------------------------------------------

async function listProducts(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();

  try {
    const category = request.query.get('category') ?? undefined;
    const inStockParam = request.query.get('inStock');
    const bestSeller = request.query.get('bestSeller') === 'true';
    const newArrival = request.query.get('newArrival') === 'true';
    const onSale = request.query.get('onSale') === 'true';
    const page = Math.max(1, parseInt(request.query.get('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.get('limit') ?? '50', 10)));

    const filters: string[] = [];
    if (category) filters.push(odata`PartitionKey eq ${category}`);
    if (inStockParam !== null && inStockParam !== undefined) {
      const inStockBool = inStockParam === 'true' || inStockParam === '1';
      // boolean isn't a string-interpolation hazard but use the same path for consistency.
      filters.push(`inStock eq ${inStockBool}`);
    }
    const filter = filters.length > 0 ? filters.join(' and ') : undefined;

    let entities = filter
      ? await queryEntities<Product>('products', filter)
      : await queryEntitiesAll<Product>('products');

    // Hide soft-deleted entries from public storefront
    entities = entities.filter(p => p.active !== false);
    if (bestSeller) entities = entities.filter(p => p.isBestSeller === true);
    if (newArrival) entities = entities.filter(p => p.isNewArrival === true);
    if (onSale) entities = entities.filter(p => p.isSale === true);

    const total = entities.length;
    const start = (page - 1) * limit;
    const products = entities.slice(start, start + limit).map(normalizeProduct);

    return json({ products, total, page });
  } catch (err) {
    context.error('listProducts error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// GET /api/products/:slug
// ---------------------------------------------------------------------------

async function getProductBySlug(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();

  try {
    const slug = request.params.slug;
    if (!slug) {
      return json({ error: 'slug is required' }, 400);
    }

    const filter = odata`slug eq ${slug}`;
    const results = await queryEntities<Product>('products', filter);

    const product = results.find(p => p.active !== false);
    if (!product) {
      return json({ error: 'Product not found' }, 404);
    }

    return json(normalizeProduct(product));
  } catch (err) {
    context.error('getProductBySlug error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// Utility: strip Table Storage metadata from entity
// ---------------------------------------------------------------------------

function normalizeProduct(entity: Product): Record<string, unknown> {
  const { partitionKey, rowKey, etag, timestamp, category: _category, images, tags, ...rest } = entity as Product & {
    etag?: string;
    timestamp?: unknown;
  };
  return {
    id: rowKey,
    category: partitionKey,
    ...rest,
    images: safeJsonArray(images),
    tags: safeJsonArray(tags),
    rating: typeof entity.rating === 'number' ? entity.rating : 0,
    reviewCount: typeof entity.reviewCount === 'number' ? entity.reviewCount : 0,
    stockCount: typeof entity.stockCount === 'number' ? entity.stockCount : 0,
    isBestSeller: entity.isBestSeller === true,
    isNewArrival: entity.isNewArrival === true,
    isSale: entity.isSale === true,
  };
}

// ---------------------------------------------------------------------------
// Register functions
// ---------------------------------------------------------------------------

app.http('listProducts', {
  route: 'products',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: listProducts,
});

app.http('getProductBySlug', {
  route: 'products/{slug}',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: getProductBySlug,
});
