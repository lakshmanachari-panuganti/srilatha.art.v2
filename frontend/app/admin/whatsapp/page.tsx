'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/admin/AdminShell';
import { adminApi, AdminApiError, AdminWhatsappSummary, AdminWhatsappHealth } from '@/lib/adminApi';

export default function AdminWhatsappPage() {
  const [conversations, setConversations] = useState<AdminWhatsappSummary[]>([]);
  const [health, setHealth] = useState<AdminWhatsappHealth | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [healthDetailOpen, setHealthDetailOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      adminApi.listConversations().then(r => r.conversations).catch(err => {
        setError(err instanceof AdminApiError ? err.message : 'Failed to load conversations');
        return [] as AdminWhatsappSummary[];
      }),
      adminApi.whatsappHealth().catch(() => null),
    ]).then(([convs, h]) => {
      setConversations(convs);
      setHealth(h);
      setLoading(false);
    });
  }, []);

  const degraded = health?.status === 'degraded';
  const missingConfig = health && Object.values(health.configured).some(v => !v);
  const brokenTables = health ? Object.entries(health.tables).filter(([, v]) => !v.ok).map(([k]) => k) : [];
  const brokenQueues = health ? Object.entries(health.queues).filter(([, v]) => !v.ok).map(([k]) => k) : [];
  const missingCredKeys = health ? Object.entries(health.configured).filter(([, v]) => !v).map(([k]) => k) : [];

  return (
    <AdminShell title="WhatsApp">
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: '0.82rem', color: '#FCA5A5', marginBottom: 'var(--sp-4)' }}>
          {error}
        </div>
      )}

      {health && (degraded || missingConfig) && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setHealthDetailOpen(o => !o)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setHealthDetailOpen(o => !o); }}
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 'var(--r-md)',
            padding: 'var(--sp-3) var(--sp-4)',
            marginBottom: 'var(--sp-4)',
            cursor: 'pointer',
            color: '#FCA5A5',
            fontSize: '0.85rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <strong>
              {missingConfig
                ? `WhatsApp credentials missing: ${missingCredKeys.join(', ')}`
                : brokenTables.length > 0
                  ? `WhatsApp storage tables unreachable: ${brokenTables.join(', ')}`
                  : brokenQueues.length > 0
                    ? `WhatsApp queues unreachable: ${brokenQueues.join(', ')}`
                    : 'WhatsApp service degraded'}
            </strong>
            <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>{healthDetailOpen ? 'Hide details ▴' : 'Show details ▾'}</span>
          </div>
          {healthDetailOpen && (
            <pre style={{ marginTop: 'var(--sp-3)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.72rem', background: 'rgba(0,0,0,0.25)', padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--r-sm)' }}>
{JSON.stringify(health, null, 2)}
            </pre>
          )}
        </div>
      )}

      {loading ? <div className="admin-empty">Loading…</div> : conversations.length === 0 ? <div className="admin-empty">No WhatsApp conversations yet.</div> : (
        <table className="admin-table">
          <thead><tr><th>Phone</th><th>Last message</th><th>Direction</th><th>When</th><th>Unread</th><th></th></tr></thead>
          <tbody>
            {conversations.map(c => (
              <tr key={c.phone}>
                <td style={{ fontFamily: 'monospace' }}>
                  {c.phone}
                  {c.contactName && <span style={{ display: 'block', fontFamily: 'inherit', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.contactName}</span>}
                </td>
                <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMessage}</td>
                <td><span className={`admin-status-pill admin-status-${c.lastDirection === 'inbound' ? 'pending' : 'confirmed'}`}>{c.lastDirection}</span></td>
                <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{new Date(c.lastTimestamp).toLocaleString('en-IN')}</td>
                <td>
                  {c.unreadCount > 0 ? (
                    <span style={{ display: 'inline-block', minWidth: 22, padding: '2px 8px', borderRadius: 999, background: '#FF6B6B', color: '#fff', fontWeight: 700, fontSize: '0.72rem', textAlign: 'center' }}>{c.unreadCount}</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>—</span>
                  )}
                </td>
                <td><Link href={`/admin/whatsapp/conversation?phone=${encodeURIComponent(c.phone)}`} className="btn btn-secondary btn-sm">Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
