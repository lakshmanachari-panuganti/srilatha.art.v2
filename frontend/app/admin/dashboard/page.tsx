'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/admin/AdminShell';
import { adminApi, AdminApiError } from '@/lib/adminApi';
import { formatPrice } from '@/lib/data';

interface Stats {
  revenue: { today: number; last7Days: number; last30Days: number; allTime: number };
  orders: { total: number; byStatus: Record<string, number> };
  products: { total: number; active: number; lowStockCount: number; lowStock: Array<{ id: string; category: string; stockCount: number }> };
  customOrders: { total: number; byStatus: Record<string, number> };
  reviews: { total: number; pending: number };
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.stats()
      .then(s => setStats(s as Stats))
      .catch(err => setError(err instanceof AdminApiError ? err.message : 'Failed to load stats'));
  }, []);

  return (
    <AdminShell title="Dashboard">
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: '0.82rem', color: '#FCA5A5', marginBottom: 'var(--sp-5)' }}>
          {error}
        </div>
      )}

      {!stats && !error && (
        <div className="admin-empty">Loading…</div>
      )}

      {stats && (
        <>
          <div className="admin-stats-grid">
            <Stat label="Revenue · Today" value={formatPrice(stats.revenue.today)} />
            <Stat label="Revenue · 7 days" value={formatPrice(stats.revenue.last7Days)} />
            <Stat label="Revenue · 30 days" value={formatPrice(stats.revenue.last30Days)} />
            <Stat label="Revenue · All time" value={formatPrice(stats.revenue.allTime)} />
          </div>

          <div className="admin-stats-grid">
            <Stat label="Total orders" value={String(stats.orders.total)} sub={Object.entries(stats.orders.byStatus).map(([k, v]) => `${k}: ${v}`).join(' · ')} />
            <Stat label="Active products" value={`${stats.products.active}/${stats.products.total}`} sub={`${stats.products.lowStockCount} low stock`} />
            <Stat label="Custom orders" value={String(stats.customOrders.total)} sub={Object.entries(stats.customOrders.byStatus).map(([k, v]) => `${k}: ${v}`).join(' · ')} />
            <Stat label="Reviews" value={String(stats.reviews.total)} sub={`${stats.reviews.pending} pending`} />
          </div>

          {stats.products.lowStock.length > 0 && (
            <section style={{ marginTop: 'var(--sp-8)' }}>
              <h2 className="admin-section-title" style={{ marginBottom: 'var(--sp-3)' }}>Low stock alerts</h2>
              <table className="admin-table">
                <thead><tr><th>Product ID</th><th>Category</th><th>Stock</th><th></th></tr></thead>
                <tbody>
                  {stats.products.lowStock.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'monospace' }}>{p.id}</td>
                      <td>{p.category}</td>
                      <td style={{ color: p.stockCount === 0 ? '#FF6B6B' : 'var(--accent-gold)', fontWeight: 700 }}>{p.stockCount}</td>
                      <td><Link href={`/admin/products/edit?id=${encodeURIComponent(p.id)}`} className="btn btn-secondary btn-sm">Edit</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </AdminShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="admin-stat">
      <div className="admin-stat-label">{label}</div>
      <div className="admin-stat-value">{value}</div>
      {sub && <div className="admin-stat-sub">{sub}</div>}
    </div>
  );
}
