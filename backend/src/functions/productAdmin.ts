import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { getEntity, queryEntities, queryEntitiesAll, upsertEntity, deleteEntity } from '../utils/tableStorage';
import { requireAdmin } from '../middleware/adminGuard';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
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

interface ProductEntity {
  partitionKey: string;   // category id
  rowKey: string;         // product id
  slug: string;
  name: string;
  shortDesc: string;
  description: string;
  price: number;          // paise
  originalPrice?: number; // paise
  images: string;         // JSON array
  material: string;
  careInstructions: string;
  dimensions: string;
  rating?: number;
  reviewCount?: number;
  inStock: boolean;
  stockCount: number;
  isBestSeller?: boolean;
  isNewArrival?: boolean;
  isSale?: boolean;
  tags: string;           // JSON array
  active: boolean;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

function shape(input: Record<string, unknown>) {
  const arrField = (v: unknown): string => {
    if (Array.isArray(v)) return JSON.stringify(v);
    if (typeof v === 'string') return v;
    return '[]';
  };
  return {
    slug: String(input.slug ?? ''),
    name: String(input.name ?? ''),
    shortDesc: String(input.shortDesc ?? ''),
    description: String(input.description ?? ''),
    price: Number(input.price ?? 0),
    ...(input.originalPrice !== undefined ? { originalPrice: Number(input.originalPrice) } : {}),
    images: arrField(input.images),
    material: String(input.material ?? ''),
    careInstructions: String(input.careInstructions ?? ''),
    dimensions: String(input.dimensions ?? ''),
    inStock: input.inStock !== false,
    stockCount: Number(input.stockCount ?? 0),
    isBestSeller: input.isBestSeller === true,
    isNewArrival: input.isNewArrival === true,
    isSale: input.isSale === true,
    tags: arrField(input.tags),
  };
}

function toApi(entity: ProductEntity) {
  return {
    id: entity.rowKey,
    category: entity.partitionKey,
    slug: entity.slug,
    name: entity.name,
    shortDesc: entity.shortDesc,
    description: entity.description,
    price: entity.price,
    originalPrice: entity.originalPrice,
    images: safeJson(entity.images),
    material: entity.material,
    careInstructions: entity.careInstructions,
    dimensions: entity.dimensions,
    rating: entity.rating ?? 0,
    reviewCount: entity.reviewCount ?? 0,
    inStock: entity.inStock,
    stockCount: entity.stockCount,
    isBestSeller: entity.isBestSeller ?? false,
    isNewArrival: entity.isNewArrival ?? false,
    isSale: entity.isSale ?? false,
    tags: safeJson(entity.tags),
    active: entity.active !== false,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function safeJson(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { return JSON.parse(value); } catch { return []; }
}

// ---------------------------------------------------------------------------
// POST /api/admin/products — create
// ---------------------------------------------------------------------------

async function adminCreateProduct(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (!body.category || !body.name || !body.slug) {
      return json({ error: 'category, name and slug are required' }, 400);
    }

    const id = `p_${uuidv4().slice(0, 12)}`;
    const now = new Date().toISOString();

    const entity: ProductEntity = {
      partitionKey: String(body.category),
      rowKey: id,
      ...shape(body),
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    await upsertEntity('products', entity);

    return json(toApi(entity), 201);
  } catch (err) {
    context.error('adminCreateProduct error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/products — list (admin sees all categories incl. inactive)
// ---------------------------------------------------------------------------

async function adminListProducts(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;

  try {
    const all = await queryEntitiesAll<ProductEntity>('products');
    return json({ products: all.map(toApi), total: all.length });
  } catch (err) {
    context.error('adminListProducts error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/products/{id} — update by id (scans for matching rowKey)
// ---------------------------------------------------------------------------

async function adminUpdateProduct(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;

  try {
    const id = request.params.id;
    if (!id) return json({ error: 'id is required' }, 400);

    // Find existing — may have moved category, so scan
    const existing = await queryEntities<ProductEntity>('products', `RowKey eq '${id}'`);
    if (!existing.length) return json({ error: 'Product not found' }, 404);
    const current = existing[0];

    const body = (await request.json()) as Record<string, unknown>;
    const newCategory = body.category ? String(body.category) : current.partitionKey;
    const now = new Date().toISOString();

    const updated: ProductEntity = {
      ...current,
      ...shape({ ...current, ...body, images: body.images ?? safeJson(current.images), tags: body.tags ?? safeJson(current.tags) }),
      partitionKey: newCategory,
      rowKey: id,
      active: body.active !== false,
      createdAt: current.createdAt,
      updatedAt: now,
    };

    // If category moved, delete old entity first
    if (newCategory !== current.partitionKey) {
      await deleteEntity('products', current.partitionKey, id);
    }
    await upsertEntity('products', updated);

    return json(toApi(updated));
  } catch (err) {
    context.error('adminUpdateProduct error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/products/{id} — soft delete (active=false)
// ---------------------------------------------------------------------------

async function adminDeleteProduct(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;

  try {
    const id = request.params.id;
    if (!id) return json({ error: 'id is required' }, 400);

    const existing = await queryEntities<ProductEntity>('products', `RowKey eq '${id}'`);
    if (!existing.length) return json({ error: 'Product not found' }, 404);
    const current = existing[0];

    const hardDelete = request.query.get('hard') === 'true';
    if (hardDelete) {
      await deleteEntity('products', current.partitionKey, id);
      return json({ success: true, hardDeleted: true });
    }

    const now = new Date().toISOString();
    await upsertEntity('products', { ...current, active: false, updatedAt: now });
    return json({ success: true, softDeleted: true });
  } catch (err) {
    context.error('adminDeleteProduct error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// Two functions share the route `mgmt/products`. Azure Functions silently
// breaks routing when more than one handler registers the same (route, method)
// pair — including the CORS preflight `OPTIONS`. Only the first handler on each
// route registers OPTIONS; the others register their own verb only.
app.http('adminListProducts', {
  route: 'mgmt/products',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: adminListProducts,
});

app.http('adminCreateProduct', {
  route: 'mgmt/products',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: adminCreateProduct,
});

app.http('adminUpdateProduct', {
  route: 'mgmt/products/{id}',
  methods: ['PATCH', 'PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: adminUpdateProduct,
});

app.http('adminDeleteProduct', {
  route: 'mgmt/products/{id}',
  methods: ['DELETE'],
  authLevel: 'anonymous',
  handler: adminDeleteProduct,
});
