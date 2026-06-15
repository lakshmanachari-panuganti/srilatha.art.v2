'use client';
import { useEffect, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { adminApi, AdminApiError, AdminReview } from '@/lib/adminApi';

const STATUSES = ['pending', 'approved', 'rejected'];

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.listReviews(status);
      setReviews(res.reviews);
    } catch (err) { setError(err instanceof AdminApiError ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  async function moderate(id: string, action: 'approve' | 'reject') {
    try { await adminApi.moderateReview(id, action); void load(); }
    catch (err) { alert(err instanceof AdminApiError ? err.message : 'Failed'); }
  }

  return (
    <AdminShell title="Reviews">
      <div className="admin-toolbar">
        <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {error && <div style={{ color: '#FCA5A5', marginBottom: 'var(--sp-4)' }}>{error}</div>}

      {loading ? <div className="admin-empty">Loading…</div> : reviews.length === 0 ? <div className="admin-empty">No {status} reviews.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {reviews.map(r => (
            <div key={r.id} className="card" style={{ padding: 'var(--sp-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.author}</span>
                    <span style={{ color: 'var(--accent-gold)', fontSize: '0.9rem' }}>{'★'.repeat(r.rating)}</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.city ?? '—'} · {new Date(r.date).toLocaleDateString('en-IN')} · product {r.productId}</div>
                </div>
                <span className={`admin-status-pill admin-status-${r.status}`}>{r.status}</span>
              </div>
              <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--sp-1)' }}>{r.title}</p>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{r.body}</p>
              {r.status === 'pending' && (
                <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
                  <button onClick={() => void moderate(r.id, 'approve')} className="btn btn-green btn-sm">Approve</button>
                  <button onClick={() => void moderate(r.id, 'reject')} className="btn btn-secondary btn-sm" style={{ color: '#FF6B6B' }}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
