'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminShell from '@/components/admin/AdminShell';
import { adminApi, AdminApiError, AdminWhatsappMessage } from '@/lib/adminApi';

function ConversationInner() {
  const sp = useSearchParams();
  const phone = sp.get('phone') ?? '';
  const [messages, setMessages] = useState<AdminWhatsappMessage[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!phone) { setError('Missing phone'); setLoading(false); return; }
    adminApi.getConversation(phone)
      .then(r => setMessages(r.messages))
      .catch(err => setError(err instanceof AdminApiError ? err.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [phone]);

  return (
    <AdminShell title={`WhatsApp · ${phone}`}>
      {error && <div style={{ color: '#FCA5A5', marginBottom: 'var(--sp-4)' }}>{error}</div>}
      {loading ? <div className="admin-empty">Loading…</div> : messages.length === 0 ? <div className="admin-empty">No messages.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', maxWidth: 680 }}>
          {messages.map(m => (
            <div key={m.rowKey} className="card" style={{
              padding: 'var(--sp-3) var(--sp-4)',
              alignSelf: m.direction === 'inbound' ? 'flex-start' : 'flex-end',
              maxWidth: '85%',
              background: m.direction === 'inbound' ? 'var(--bg-card)' : 'rgba(0,163,255,0.08)',
              border: m.direction === 'inbound' ? '1px solid var(--border)' : '1px solid var(--border-accent)',
            }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                {m.body ?? m.templateName ?? '(no body)'}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
                {m.direction} · {new Date(m.timestamp).toLocaleString('en-IN')}{m.status ? ` · ${m.status}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

export default function Page() {
  return <Suspense fallback={null}><ConversationInner /></Suspense>;
}
