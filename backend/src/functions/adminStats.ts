import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { queryEntitiesAll } from '../utils/tableStorage';
import { requireAdmin } from '../middleware/adminGuard';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function options(): HttpResponseInit { return { status: 204, headers: CORS_HEADERS }; }

interface OrderEntity {
  partitionKey: string;
  rowKey: string;
  total: number;
  createdAt: string;
}

interface ProductEntity {
  partitionKey: string;
  rowKey: string;
  stockCount: number;
  active?: boolean;
}

interface CustomOrderEntity { partitionKey: string; rowKey: string; }
interface ReviewEntity { partitionKey: string; rowKey: string; }

async function adminGetStats(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;

  try {
    const [orders, products, customOrders, reviews] = await Promise.all([
      queryEntitiesAll<OrderEntity>('orders'),
      queryEntitiesAll<ProductEntity>('products'),
      queryEntitiesAll<CustomOrderEntity>('customOrders'),
      queryEntitiesAll<ReviewEntity>('reviews'),
    ]);

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const paidOrders = orders.filter(o => o.partitionKey !== 'pending' && o.partitionKey !== 'cancelled');
    const revenueAll = paidOrders.reduce((s, o) => s + (o.total ?? 0), 0);

    const revenueWindow = (windowDays: number) =>
      paidOrders
        .filter(o => o.createdAt && (now - new Date(o.createdAt).getTime()) <= windowDays * dayMs)
        .reduce((s, o) => s + (o.total ?? 0), 0);

    const ordersByStatus: Record<string, number> = {};
    for (const o of orders) {
      ordersByStatus[o.partitionKey] = (ordersByStatus[o.partitionKey] ?? 0) + 1;
    }

    const lowStock = products.filter(p => p.active !== false && (p.stockCount ?? 0) < 5)
      .map(p => ({ id: p.rowKey, category: p.partitionKey, stockCount: p.stockCount }));

    return json({
      revenue: {
        today: revenueWindow(1),
        last7Days: revenueWindow(7),
        last30Days: revenueWindow(30),
        allTime: revenueAll,
      },
      orders: {
        total: orders.length,
        byStatus: ordersByStatus,
      },
      products: {
        total: products.length,
        active: products.filter(p => p.active !== false).length,
        lowStockCount: lowStock.length,
        lowStock,
      },
      customOrders: {
        total: customOrders.length,
        byStatus: customOrders.reduce<Record<string, number>>((m, c) => { m[c.partitionKey] = (m[c.partitionKey] ?? 0) + 1; return m; }, {}),
      },
      reviews: {
        total: reviews.length,
        pending: reviews.filter(r => r.partitionKey === 'pending').length,
      },
    });
  } catch (err) {
    context.error('adminGetStats error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

app.http('adminGetStats', { route: 'mgmt/stats', methods: ['GET', 'OPTIONS'], authLevel: 'anonymous', handler: adminGetStats });
