'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminShell from '@/components/admin/AdminShell';
import { adminApi, AdminApiError, AdminOrderDetail } from '@/lib/adminApi';
import { formatPrice } from '@/lib/data';
import { waLink } from '@/lib/contact';

const STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

function DetailInner() {
  const sp = useSearchParams();
  const id = sp.get('id') ?? '';
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [tracking, setTracking] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!id) { setError('Missing order id'); return; }
    try {
      const o = await adminApi.getOrder(id);
      setOrder(o);
      setTracking(o.trackingNumber ?? '');
      setTrackingUrl(o.trackingUrl ?? '');
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Failed to load');
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function changeStatus(newStatus: string) {
    if (!confirm(`Change status to "${newStatus}"?`)) return;
    setBusy(true);
    try {
      await adminApi.updateOrderStatus(id, {
        status: newStatus,
        note: note || undefined,
        trackingNumber: tracking || undefined,
        trackingUrl: trackingUrl || undefined,
      });
      setNote('');
      void load();
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : 'Update failed');
    } finally { setBusy(false); }
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await adminApi.addOrderNote(id, note);
      setNote('');
      void load();
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : 'Note failed');
    } finally { setBusy(false); }
  }

  if (error) return <AdminShell title="Order"><div style={{ color: '#FCA5A5' }}>{error}</div></AdminShell>;
  if (!order) return <AdminShell title="Order"><div className="admin-empty">Loading…</div></AdminShell>;

  return (
    <AdminShell title={`Order ${order.orderId}`}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--sp-6)' }}>
        <div className="card" style={{ padding: 'var(--sp-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Status</h2>
            <span className={`admin-status-pill admin-status-${order.status}`}>{order.status}</span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            {STATUSES.filter(s => s !== order.status).map(s => (
              <button key={s} onClick={() => void changeStatus(s)} disabled={busy} className="btn btn-secondary btn-sm">
                → {s}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--sp-5)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 'var(--sp-3)' }}>Customer</h2>
          {order.customer ? (
            <>
              <p style={{ fontWeight: 700 }}>{order.customer.name}</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{order.customer.email}</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{order.customer.phone}</p>
              <div style={{ marginTop: 'var(--sp-3)' }}>
                <a className="btn btn-whatsapp btn-sm" href={waLink(`Hi! Quick update about your order ${order.orderId}.`)} target="_blank" rel="noopener noreferrer">WhatsApp customer</a>
              </div>
            </>
          ) : <p style={{ color: 'var(--text-muted)' }}>No customer details</p>}
          {order.address && (
            <address style={{ fontStyle: 'normal', marginTop: 'var(--sp-4)', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>Ship to</div>
              {order.address.line1}<br />{order.address.city}, {order.address.state} — {order.address.pincode}
            </address>
          )}
        </div>

        <div className="card" style={{ padding: 'var(--sp-5)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 'var(--sp-3)' }}>Items</h2>
          <table className="admin-table">
            <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Line total</th></tr></thead>
            <tbody>
              {order.items.map((it, i) => (
                <tr key={i}>
                  <td>{it.name}<div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{it.productId}</div></td>
                  <td>{it.qty}</td>
                  <td>{formatPrice(it.price)}</td>
                  <td>{formatPrice(it.price * it.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}><span>Subtotal</span><span>{formatPrice(order.subtotal)}</span></div>
            {order.discount && order.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-green)' }}><span>Discount ({order.couponCode})</span><span>−{formatPrice(order.discount)}</span></div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}><span>Shipping</span><span>{order.shipping === 0 ? 'FREE' : formatPrice(order.shipping)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1rem', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
              <span>Total</span>
              <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{formatPrice(order.total)}</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--sp-5)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 'var(--sp-3)' }}>Tracking</h2>
          <div className="admin-form-grid-2">
            <div>
              <label className="form-label">Tracking number</label>
              <input className="form-input" value={tracking} onChange={e => setTracking(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Tracking URL</label>
              <input className="form-input" value={trackingUrl} onChange={e => setTrackingUrl(e.target.value)} />
            </div>
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 'var(--sp-2)' }}>Saved when you next change status.</p>
        </div>

        <div className="card" style={{ padding: 'var(--sp-5)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 'var(--sp-3)' }}>Notes &amp; activity</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            {order.events.map((ev, i) => (
              <div key={i} style={{ borderLeft: '2px solid var(--accent-blue)', paddingLeft: 'var(--sp-3)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{ev.eventType} · {new Date(ev.timestamp).toLocaleString('en-IN')}</div>
                {ev.from && ev.to && <div style={{ fontSize: '0.85rem' }}>{ev.from} → {ev.to}</div>}
                {ev.note && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{ev.note}</div>}
                {ev.changedBy && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>by {ev.changedBy}</div>}
              </div>
            ))}
            {order.events.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No events yet.</p>}
          </div>

          <div style={{ marginTop: 'var(--sp-5)' }}>
            <textarea className="form-input form-textarea" placeholder="Add an internal note…" value={note} onChange={e => setNote(e.target.value)} rows={2} />
            <button onClick={() => void addNote()} disabled={busy || !note.trim()} className="btn btn-secondary" style={{ marginTop: 'var(--sp-2)' }}>
              Add note
            </button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

export default function Page() {
  return <Suspense fallback={null}><DetailInner /></Suspense>;
}
