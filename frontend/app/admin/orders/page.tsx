'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/admin/AdminShell';
import { adminApi, AdminApiError, AdminOrder } from '@/lib/adminApi';
import { formatPrice } from '@/lib/data';

const STATUS_OPTIONS = ['', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] as const;

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.listOrders({
        status: status || undefined,
        search: search.trim() || undefined,
        limit: 100,
      });
      setOrders(res.orders);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Failed to load orders');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkUpdate(newStatus: string) {
    if (!selected.size) return;
    if (!confirm(`Move ${selected.size} order(s) to "${newStatus}"?`)) return;
    try {
      await adminApi.bulkOrderStatus(Array.from(selected), newStatus);
      setSelected(new Set());
      void load();
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : 'Bulk update failed');
    }
  }

  return (
    <AdminShell title="Orders">
      <div className="admin-toolbar">
        <input
          type="search"
          className="admin-search-input"
          placeholder="Search by order id, name, email or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void load(); }}
        />
        <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s ? s : 'all'}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={() => void load()}>Refresh</button>
        {selected.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{selected.size} selected</span>
            <select className="admin-select" onChange={e => { void bulkUpdate(e.target.value); e.target.value = ''; }} defaultValue="">
              <option value="" disabled>Bulk status →</option>
              {STATUS_OPTIONS.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', color: '#FCA5A5', marginBottom: 'var(--sp-4)' }}>{error}</div>
      )}

      {loading ? <div className="admin-empty">Loading…</div> : orders.length === 0 ? <div className="admin-empty">No orders.</div> : (
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.orderId}>
                <td>
                  <input type="checkbox" checked={selected.has(o.orderId)} onChange={() => toggleSelect(o.orderId)} />
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{o.orderId}</td>
                <td>
                  <div style={{ fontWeight: 700 }}>{o.customer?.name ?? '—'}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{o.customer?.email ?? '—'}</div>
                </td>
                <td>{formatPrice(o.total)}</td>
                <td><span className={`admin-status-pill admin-status-${o.status}`}>{o.status}</span></td>
                <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {o.createdAt ? new Date(o.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                </td>
                <td><Link href={`/admin/orders/detail?id=${encodeURIComponent(o.orderId)}`} className="btn btn-secondary btn-sm">Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
