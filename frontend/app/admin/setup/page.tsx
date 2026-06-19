'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminApi, AdminApiError } from '@/lib/adminApi';
import { ShieldCheck } from 'lucide-react';

export default function AdminSetupPage() {
  const router = useRouter();
  const [name, setName]     = useState('');
  const [email, setEmail]   = useState('');
  const [password, setPwd]  = useState('');
  const [confirm, setConf]  = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');
  const [done, setDone]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < 10) { setError('Password must be at least 10 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (!setupToken.trim()) { setError('Setup token is required.'); return; }
    setBusy(true);
    setError('');
    try {
      await adminApi.setup({ name: name.trim(), email: email.trim(), password, setupToken: setupToken.trim() });
      setDone(true);
      setTimeout(() => router.push('/admin'), 1500);
    } catch (err) {
      const msg = err instanceof AdminApiError ? err.message : 'Setup failed.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-6)' }}>
        <div className="card" style={{ maxWidth: 420, padding: 'var(--sp-10) var(--sp-8)', textAlign: 'center' }}>
          <ShieldCheck size={48} color="var(--accent-green)" />
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 'var(--sp-4)' }}>First admin created</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 'var(--sp-3)' }}>Redirecting to login…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-6)' }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div className="card" style={{ padding: 'var(--sp-10) var(--sp-8)' }}>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 'var(--sp-2)' }}>
            First-Time Admin Setup
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 'var(--sp-6)', lineHeight: 1.6 }}>
            This page only works once, when no admins exist yet. The <code>ADMIN_SETUP_TOKEN</code> env var must be set on the Function App.
          </p>

          <form onSubmit={handleSubmit} className="admin-form">
            <div>
              <label className="form-label">Full Name</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Email</label>
              <input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="admin-form-grid-2">
              <div>
                <label className="form-label">Password (min 10)</label>
                <input type="password" className="form-input" value={password} onChange={e => setPwd(e.target.value)} required />
              </div>
              <div>
                <label className="form-label">Confirm</label>
                <input type="password" className="form-input" value={confirm} onChange={e => setConf(e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="form-label">Setup Token</label>
              <input className="form-input" value={setupToken} onChange={e => setSetupToken(e.target.value)} required placeholder="From server env" />
            </div>
            {error && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: '0.82rem', color: '#FCA5A5' }}>{error}</div>
            )}
            <button type="submit" disabled={busy} className="btn btn-primary btn-full pulse-glow">
              {busy ? 'Creating…' : 'Create Admin'}
            </button>
          </form>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--sp-4)', textAlign: 'center' }}>
            Already have an admin?{' '}
            <Link href="/admin" style={{ color: 'var(--accent-blue)' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
