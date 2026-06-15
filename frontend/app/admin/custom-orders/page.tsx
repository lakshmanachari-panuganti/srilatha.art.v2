'use client';
import { useEffect, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { adminApi, AdminApiError, AdminCustomOrder } from '@/lib/adminApi';
import { waLink } from '@/lib/contact';

const STATUSES = ['new', 'in_review', 'quoted', 'in_progress', 'completed', 'declined'];

export default function AdminCustomOrdersPage() {
  const [orders, setOrders] = useState<AdminCustomOrder[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.listCustomOrders(status || undefined);
      setOrders(res.customOrders);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Failed to load');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  async function changeStatus(id: string, newStatus: string) {
    try {
      await adminApi.updateCustomOrder(id, { status: newStatus });
      void load();
    } catch (err) { alert(err instanceof AdminApiError ? err.message : 'Failed'); }
  }

  async function saveNote(id: string, note: string) {
    try {
      await adminApi.updateCustomOrder(id, { adminNote: note });
      void load();
    } catch (err) { alert(err instanceof AdminApiError ? err.message : 'Failed'); }
  }

  return (
    <AdminShell title="Custom Orders">
      <div className="admin-toolbar">
        <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {error && <div style={{ color: '#FCA5A5', marginBottom: 'var(--sp-4)' }}>{error}</div>}
      {loading ? <div className="admin-empty">Loading…</div> : orders.length === 0 ? <div className="admin-empty">No custom orders.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {orders.map(co => (
            <div key={co.id} className="card" style={{ padding: 'var(--sp-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{co.name}</span>
                    <span className={`admin-status-pill admin-status-${co.status}`}>{co.status}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{co.artType} · {co.budget} · {new Date(co.createdAt).toLocaleDateString('en-IN')}</div>
                </div>
                <a className="btn btn-whatsapp btn-sm" href={waLink(`Hi ${co.name}! Following up on your custom ${co.artType} request.`)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                <select className="admin-select" value={co.status} onChange={e => void changeStatus(co.id, e.target.value)}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => setExpanded(expanded === co.id ? null : co.id)} className="btn btn-secondary btn-sm">
                  {expanded === co.id ? 'Hide' : 'Open'}
                </button>
              </div>

              {expanded === co.id && (
                <div style={{ marginTop: 'var(--sp-4)', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--border)', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  <p><strong>Email:</strong> {co.email}</p>
                  <p><strong>Phone:</strong> {co.phone}</p>
                  {co.dimensions && <p><strong>Dimensions:</strong> {co.dimensions}</p>}
                  {co.colorPreferences && <p><strong>Colors:</strong> {co.colorPreferences}</p>}
                  {co.occasion && <p><strong>Occasion:</strong> {co.occasion}</p>}
                  <p style={{ marginTop: 'var(--sp-3)' }}><strong>Description:</strong></p>
                  <p>{co.description}</p>
                  {co.referenceUrl && <p><a href={co.referenceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)' }}>Reference image →</a></p>}
                  <div style={{ marginTop: 'var(--sp-4)' }}>
                    <label className="form-label">Admin note</label>
                    <textarea className="form-input form-textarea" defaultValue={co.adminNote ?? ''} onBlur={e => void saveNote(co.id, e.target.value)} rows={2} placeholder="Quote details, internal notes…" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
