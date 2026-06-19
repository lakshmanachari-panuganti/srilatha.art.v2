'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAdminAuth } from '@/components/admin/AdminAuthProvider';
import { AdminApiError } from '@/lib/adminApi';
import { Lock } from 'lucide-react';

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/admin/dashboard';
  const { admin, ready, login } = useAdminAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (ready && admin) router.replace(next);
  }, [ready, admin, next, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      router.replace(next);
    } catch (err) {
      const msg = err instanceof AdminApiError ? err.message : 'Login failed. Please try again.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-6)' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div className="card" style={{ padding: 'var(--sp-10) var(--sp-8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-6)' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 'var(--r-lg)',
              background: 'var(--gradient-brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--glow-blue)',
            }}>
              <Lock size={22} color="#fff" strokeWidth={2} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Srilatha<span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Admin</span>
              </h1>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Staff sign-in</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="admin-form">
            <div>
              <label className="form-label" htmlFor="admin-email">Email</label>
              <input
                id="admin-email"
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="form-label" htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: '0.82rem', color: '#FCA5A5' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn btn-primary btn-full pulse-glow">
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 'var(--sp-6)', textAlign: 'center' }}>
            First time?{' '}
            <Link href="/admin/setup" style={{ color: 'var(--accent-blue)' }}>
              Set up the first admin
            </Link>
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: 'var(--sp-5)' }}>
          <Link href="/" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>← Back to storefront</Link>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg-base)' }} />}>
      <LoginInner />
    </Suspense>
  );
}
