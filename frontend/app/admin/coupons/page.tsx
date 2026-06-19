'use client';
import { useEffect, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { adminApi, AdminApiError, AdminCoupon } from '@/lib/adminApi';
import { formatPrice } from '@/lib/data';
import { Plus, Trash2 } from 'lucide-react';

const TYPES = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING'] as const;

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<AdminCoupon>>({ type: 'PERCENTAGE', value: 10, active: true });
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.listCoupons();
      setCoupons(res.coupons);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Failed');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate() {
    if (!form.code || !form.type) return;
    setBusy(true);
    try {
      await adminApi.createCoupon(form);
      setForm({ type: 'PERCENTAGE', value: 10, active: true });
      setShowForm(false);
      void load();
    } catch (err) { alert(err instanceof AdminApiError ? err.message : 'Failed'); }
    finally { setBusy(false); }
  }

  async function handleDelete(code: string) {
    if (!confirm(`Delete coupon ${code}?`)) return;
    try { await adminApi.deleteCoupon(code); void load(); }
    catch (err) { alert(err instanceof AdminApiError ? err.message : 'Failed'); }
  }

  async function toggleActive(c: AdminCoupon) {
    try { await adminApi.updateCoupon(c.code, { active: !c.active }); void load(); }
    catch (err) { alert(err instanceof AdminApiError ? err.message : 'Failed'); }
  }

  return (
    <AdminShell title="Coupons">
      <div className="admin-toolbar">
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}><Plus size={16} /> {showForm ? 'Cancel' : 'New coupon'}</button>
      </div>

      {error && <div style={{ color: '#FCA5A5', marginBottom: 'var(--sp-4)' }}>{error}</div>}

      {showForm && (
        <div className="card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)' }}>
          <div className="admin-form-grid-2">
            <div>
              <label className="form-label">Code *</label>
              <input className="form-input" value={form.code ?? ''} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="FIRST10" />
            </div>
            <div>
              <label className="form-label">Type *</label>
              <select className="form-input form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as typeof TYPES[number] }))}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Value *</label>
              <input type="number" className="form-input" value={form.value ?? 0} onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))} />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {form.type === 'PERCENTAGE' ? 'Percent (1–100)' : form.type === 'FIXED_AMOUNT' ? 'Amount in paise' : 'Ignored for free shipping'}
              </span>
            </div>
            <div>
              <label className="form-label">Min order (paise)</label>
              <input type="number" className="form-input" value={form.minOrderAmount ?? ''} onChange={e => setForm(f => ({ ...f, minOrderAmount: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div>
              <label className="form-label">Max discount (paise)</label>
              <input type="number" className="form-input" value={form.maxDiscount ?? ''} onChange={e => setForm(f => ({ ...f, maxDiscount: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div>
              <label className="form-label">Usage limit</label>
              <input type="number" className="form-input" value={form.usageLimit ?? ''} onChange={e => setForm(f => ({ ...f, usageLimit: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div>
              <label className="form-label">Start date</label>
              <input type="date" className="form-input" value={form.startDate?.slice(0, 10) ?? ''} onChange={e => setForm(f => ({ ...f, startDate: e.target.value ? new Date(e.target.value).toISOString() : undefined }))} />
            </div>
            <div>
              <label className="form-label">End date</label>
              <input type="date" className="form-input" value={form.endDate?.slice(0, 10) ?? ''} onChange={e => setForm(f => ({ ...f, endDate: e.target.value ? new Date(e.target.value).toISOString() : undefined }))} />
            </div>
          </div>
          <div style={{ marginTop: 'var(--sp-4)' }}>
            <label className="form-label">Description</label>
            <input className="form-input" value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="10% off your first order" />
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-3)', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.promoteInBanner ?? false} onChange={e => setForm(f => ({ ...f, promoteInBanner: e.target.checked }))} /> Promote in banner
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.active ?? true} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} /> Active
            </label>
          </div>
          <button onClick={() => void handleCreate()} disabled={busy} className="btn btn-primary" style={{ marginTop: 'var(--sp-4)' }}>{busy ? 'Saving…' : 'Create'}</button>
        </div>
      )}

      {loading ? <div className="admin-empty">Loading…</div> : coupons.length === 0 ? <div className="admin-empty">No coupons yet.</div> : (
        <table className="admin-table">
          <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Usage</th><th>Window</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {coupons.map(c => (
              <tr key={c.code}>
                <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.code}</td>
                <td style={{ fontSize: '0.78rem' }}>{c.type}</td>
                <td>
                  {c.type === 'PERCENTAGE' ? `${c.value}%` : c.type === 'FIXED_AMOUNT' ? formatPrice(c.value) : '—'}
                </td>
                <td>{c.currentUsage}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {c.startDate ? new Date(c.startDate).toLocaleDateString('en-IN') : '—'} → {c.endDate ? new Date(c.endDate).toLocaleDateString('en-IN') : '—'}
                </td>
                <td>
                  <button onClick={() => void toggleActive(c)} className={`admin-status-pill admin-status-${c.active ? 'delivered' : 'cancelled'}`} style={{ cursor: 'pointer', border: 'none' }}>
                    {c.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td>
                  <button onClick={() => void handleDelete(c.code)} className="btn btn-secondary btn-sm" style={{ color: '#FF6B6B' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
