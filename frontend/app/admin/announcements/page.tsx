'use client';
import { useEffect, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { adminApi, AdminApiError, AdminAnnouncement } from '@/lib/adminApi';
import { Plus, Trash2 } from 'lucide-react';

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<AdminAnnouncement[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<AdminAnnouncement>>({ active: true, priority: 0 });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.listAnnouncements();
      setItems(res.announcements);
    } catch (err) { setError(err instanceof AdminApiError ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate() {
    if (!form.message) return;
    setBusy(true);
    try {
      await adminApi.createAnnouncement(form);
      setForm({ active: true, priority: 0 });
      setShowForm(false);
      void load();
    } catch (err) { alert(err instanceof AdminApiError ? err.message : 'Failed'); }
    finally { setBusy(false); }
  }

  async function toggleActive(a: AdminAnnouncement) {
    try { await adminApi.updateAnnouncement(a.id, { active: !a.active }); void load(); }
    catch (err) { alert(err instanceof AdminApiError ? err.message : 'Failed'); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return;
    try { await adminApi.deleteAnnouncement(id); void load(); }
    catch (err) { alert(err instanceof AdminApiError ? err.message : 'Failed'); }
  }

  return (
    <AdminShell title="Announcements">
      <div className="admin-toolbar">
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}><Plus size={16} /> {showForm ? 'Cancel' : 'New'}</button>
      </div>
      {error && <div style={{ color: '#FCA5A5', marginBottom: 'var(--sp-4)' }}>{error}</div>}

      {showForm && (
        <div className="card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)' }}>
          <div>
            <label className="form-label">Message *</label>
            <input className="form-input" value={form.message ?? ''} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Free shipping above ₹999" />
          </div>
          <div className="admin-form-grid-2" style={{ marginTop: 'var(--sp-3)' }}>
            <div>
              <label className="form-label">Link (optional)</label>
              <input className="form-input" value={form.link ?? ''} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} placeholder="/shop" />
            </div>
            <div>
              <label className="form-label">Priority</label>
              <input type="number" className="form-input" value={form.priority ?? 0} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} />
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
          <button onClick={() => void handleCreate()} disabled={busy} className="btn btn-primary" style={{ marginTop: 'var(--sp-4)' }}>{busy ? 'Saving…' : 'Create'}</button>
        </div>
      )}

      {loading ? <div className="admin-empty">Loading…</div> : items.length === 0 ? <div className="admin-empty">No announcements.</div> : (
        <table className="admin-table">
          <thead><tr><th>Message</th><th>Window</th><th>Priority</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {items.map(a => (
              <tr key={a.id}>
                <td>{a.message}{a.link && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>→ {a.link}</div>}</td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {a.startDate ? new Date(a.startDate).toLocaleDateString('en-IN') : '—'} → {a.endDate ? new Date(a.endDate).toLocaleDateString('en-IN') : '—'}
                </td>
                <td>{a.priority}</td>
                <td>
                  <button onClick={() => void toggleActive(a)} className={`admin-status-pill admin-status-${a.active ? 'delivered' : 'cancelled'}`} style={{ cursor: 'pointer', border: 'none' }}>
                    {a.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td>
                  <button onClick={() => void handleDelete(a.id)} className="btn btn-secondary btn-sm" style={{ color: '#FF6B6B' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
