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
  whatsapp: {
    total: number;
    unread: number;
    lastWebhookReceivedAt: string | null;
    lastSendOkAt: string | null;
    lastError: string | null;
    lastErrorDetail: string | null;
    lastErrorAt: string | null;
  };
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [waDetailOpen, setWaDetailOpen] = useState(false);

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

          <div className="admin-stats-grid">
            <WhatsappTile
              total={stats.whatsapp.total}
              unread={stats.whatsapp.unread}
              error={stats.whatsapp.lastError}
              errorDetail={stats.whatsapp.lastErrorDetail}
              errorAt={stats.whatsapp.lastErrorAt}
              lastReceiveAt={stats.whatsapp.lastWebhookReceivedAt}
              open={waDetailOpen}
              onToggle={() => setWaDetailOpen(o => !o)}
            />
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

function WhatsappTile({
  total, unread, error, errorDetail, errorAt, lastReceiveAt, open, onToggle,
}: {
  total: number;
  unread: number;
  error: string | null;
  errorDetail: string | null;
  errorAt: string | null;
  lastReceiveAt: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  const hasError = !!error;
  return (
    <div
      className="admin-stat"
      role={hasError ? 'button' : undefined}
      tabIndex={hasError ? 0 : undefined}
      onClick={hasError ? onToggle : undefined}
      onKeyDown={hasError ? (e => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }) : undefined}
      style={hasError ? {
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.45)',
        cursor: 'pointer',
      } : undefined}
    >
      <div className="admin-stat-label" style={hasError ? { color: '#FCA5A5' } : undefined}>
        WhatsApp{hasError ? ' · ERROR' : ''}
      </div>
      <div className="admin-stat-value" style={hasError ? { color: '#FCA5A5' } : undefined}>
        {hasError ? '⚠' : String(total)}
      </div>
      <div className="admin-stat-sub">
        {hasError ? (
          <span style={{ color: '#FCA5A5' }}>{error} · click for details</span>
        ) : (
          <>
            {unread} unread
            {lastReceiveAt && <span style={{ marginLeft: 6, opacity: 0.7 }}>· last received {new Date(lastReceiveAt).toLocaleString('en-IN')}</span>}
          </>
        )}
      </div>
      {hasError && open && (
        <pre style={{
          marginTop: 'var(--sp-3)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: '0.72rem',
          background: 'rgba(0,0,0,0.3)',
          padding: 'var(--sp-2) var(--sp-3)',
          borderRadius: 'var(--r-sm)',
          color: '#FCA5A5',
          maxHeight: 300,
          overflow: 'auto',
        }}>
{errorDetail ?? error}
{errorAt ? `\n\nAt: ${new Date(errorAt).toLocaleString('en-IN')}` : ''}
        </pre>
      )}
    </div>
  );
}
