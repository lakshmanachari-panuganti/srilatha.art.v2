import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
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
  price: number;
  images?: string;
  inStock: boolean;
  category: string;
  [key: string]: unknown;
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
    const page = Math.max(1, parseInt(request.query.get('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.get('limit') ?? '20', 10)));

    // Build OData filter
    const filters: string[] = [];
    if (category) {
      filters.push(`PartitionKey eq '${category}'`);
    }
    if (inStockParam !== null && inStockParam !== undefined) {
      const inStockBool = inStockParam === 'true' || inStockParam === '1';
      filters.push(`inStock eq ${inStockBool}`);
    }
    const filter = filters.length > 0 ? filters.join(' and ') : undefined;

    const allEntities = filter 
      ? await queryEntities<Product>('products', filter)
      : await queryEntitiesAll<Product>('products');

    const total = allEntities.length;
    const start = (page - 1) * limit;
    const products = allEntities.slice(start, start + limit).map(normalizeProduct);

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

    const filter = `slug eq '${slug}'`;
    const results = await queryEntities<Product>('products', filter);

    if (!results || results.length === 0) {
      return json({ error: 'Product not found' }, 404);
    }

    return json(normalizeProduct(results[0]));
  } catch (err) {
    context.error('getProductBySlug error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// Utility: strip Table Storage metadata from entity
// ---------------------------------------------------------------------------

function normalizeProduct(entity: Product): Record<string, unknown> {
  const { partitionKey, rowKey, etag, timestamp, category: _category, ...rest } = entity as Product & {
    etag?: string;
    timestamp?: unknown;
  };
  return {
    id: rowKey,
    category: partitionKey,
    ...rest,
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
