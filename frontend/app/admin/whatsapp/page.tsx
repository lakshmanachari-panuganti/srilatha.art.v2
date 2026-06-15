'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/admin/AdminShell';
import { adminApi, AdminApiError, AdminWhatsappSummary } from '@/lib/adminApi';

export default function AdminWhatsappPage() {
  const [conversations, setConversations] = useState<AdminWhatsappSummary[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.listConversations()
      .then(res => setConversations(res.conversations))
      .catch(err => setError(err instanceof AdminApiError ? err.message : 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminShell title="WhatsApp">
      {error && <div style={{ color: '#FCA5A5', marginBottom: 'var(--sp-4)' }}>{error}</div>}
      {loading ? <div className="admin-empty">Loading…</div> : conversations.length === 0 ? <div className="admin-empty">No WhatsApp conversations yet.</div> : (
        <table className="admin-table">
          <thead><tr><th>Phone</th><th>Last message</th><th>Direction</th><th>When</th><th></th></tr></thead>
          <tbody>
            {conversations.map(c => (
              <tr key={c.phone}>
                <td style={{ fontFamily: 'monospace' }}>{c.phone}</td>
                <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMessage}</td>
                <td><span className={`admin-status-pill admin-status-${c.lastDirection === 'inbound' ? 'pending' : 'confirmed'}`}>{c.lastDirection}</span></td>
                <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{new Date(c.lastTimestamp).toLocaleString('en-IN')}</td>
                <td><Link href={`/admin/whatsapp/conversation?phone=${encodeURIComponent(c.phone)}`} className="btn btn-secondary btn-sm">Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
