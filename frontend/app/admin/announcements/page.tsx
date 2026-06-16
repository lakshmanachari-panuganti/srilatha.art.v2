'use client';
import { useEffect, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { adminApi, AdminApiError, AdminAnnouncement } from '@/lib/adminApi';
import { Plus, Trash2, Pencil } from 'lucide-react';

type FormState = Partial<AdminAnnouncement>;

const EMPTY_FORM: FormState = { active: true, priority: 0 };

function toDateInput(iso?: string): string {
  return iso ? iso.slice(0, 10) : '';
}

function fromDateInput(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<AdminAnnouncement[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(a: AdminAnnouncement) {
    setForm({
      message: a.message,
      cta: a.cta,
      link: a.link,
      startDate: a.startDate,
      endDate: a.endDate,
      active: a.active,
      priority: a.priority,
    });
    setEditingId(a.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.message) return;
    setBusy(true);
    try {
      if (editingId) {
        await adminApi.updateAnnouncement(editingId, form);
      } else {
        await adminApi.createAnnouncement(form);
      }
      resetForm();
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
    try {
      await adminApi.deleteAnnouncement(id);
      if (editingId === id) resetForm();
      void load();
    } catch (err) { alert(err instanceof AdminApiError ? err.message : 'Failed'); }
  }

  return (
    <AdminShell title="Announcements">
      <div className="admin-toolbar">
        <button
          className="btn btn-primary"
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
        >
          <Plus size={16} /> {showForm ? 'Cancel' : 'New'}
        </button>
      </div>
      {error && <div style={{ color: '#FCA5A5', marginBottom: 'var(--sp-4)' }}>{error}</div>}

      {showForm && (
        <div className="card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)' }}>
          <div style={{ fontWeight: 700, marginBottom: 'var(--sp-3)' }}>
            {editingId ? 'Edit announcement' : 'New announcement'}
          </div>
          <div>
            <label className="form-label">Message *</label>
            <input
              className="form-input"
              value={form.message ?? ''}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Free shipping above ₹999"
            />
          </div>
          <div className="admin-form-grid-2" style={{ marginTop: 'var(--sp-3)' }}>
            <div>
              <label className="form-label">CTA text (optional)</label>
              <input
                className="form-input"
                value={form.cta ?? ''}
                onChange={e => setForm(f => ({ ...f, cta: e.target.value }))}
                placeholder="Shop Now"
              />
            </div>
            <div>
              <label className="form-label">CTA link (optional)</label>
              <input
                className="form-input"
                value={form.link ?? ''}
                onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
                placeholder="/shop"
              />
            </div>
            <div>
              <label className="form-label">Priority</label>
              <input
                type="number"
                className="form-input"
                value={form.priority ?? 0}
                onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="form-label">Active</label>
              <select
                className="form-input"
                value={form.active === false ? 'false' : 'true'}
                onChange={e => setForm(f => ({ ...f, active: e.target.value === 'true' }))}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <div>
              <label className="form-label">Start date</label>
              <input
                type="date"
                className="form-input"
                value={toDateInput(form.startDate)}
                onChange={e => setForm(f => ({ ...f, startDate: fromDateInput(e.target.value) }))}
              />
            </div>
            <div>
              <label className="form-label">End date</label>
              <input
                type="date"
                className="form-input"
                value={toDateInput(form.endDate)}
                onChange={e => setForm(f => ({ ...f, endDate: fromDateInput(e.target.value) }))}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)' }}>
            <button onClick={() => void handleSave()} disabled={busy} className="btn btn-primary">
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Create'}
            </button>
            <button onClick={resetForm} disabled={busy} className="btn btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {loading ? <div className="admin-empty">Loading…</div> : items.length === 0 ? <div className="admin-empty">No announcements.</div> : (
        <table className="admin-table">
          <thead><tr><th>Message</th><th>CTA</th><th>Window</th><th>Priority</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {items.map(a => (
              <tr key={a.id}>
                <td>{a.message}</td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {a.cta || a.link ? <>{a.cta ?? '—'}{a.link && <div>→ {a.link}</div>}</> : '—'}
                </td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {a.startDate ? new Date(a.startDate).toLocaleDateString('en-IN') : '—'} → {a.endDate ? new Date(a.endDate).toLocaleDateString('en-IN') : '—'}
                </td>
                <td>{a.priority}</td>
                <td>
                  <button onClick={() => void toggleActive(a)} className={`admin-status-pill admin-status-${a.active ? 'delivered' : 'cancelled'}`} style={{ cursor: 'pointer', border: 'none' }}>
                    {a.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                  <button onClick={() => startEdit(a)} className="btn btn-secondary btn-sm" aria-label="Edit"><Pencil size={14} /></button>
                  <button onClick={() => void handleDelete(a.id)} className="btn btn-secondary btn-sm" style={{ color: '#FF6B6B' }} aria-label="Delete"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
