'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth, useIsGoogleAuthConfigured } from '@/components/auth/AuthProvider';
import { authGoogle, ApiError } from '@/lib/api';

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/account';
  const { user, login } = useAuth();
  const googleAuthConfigured = useIsGoogleAuthConfigured();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        setLoading(true);
        const res = await authGoogle({ accessToken: tokenResponse.access_token });
        login(res.token);
        router.replace(next);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to sign in with Google. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    onError: () => setError('Google sign-in was cancelled or failed.'),
  });

  return (
    <div className="page-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="container" style={{ maxWidth: 460 }}>
        <div className="card" style={{ padding: 'var(--sp-10) var(--sp-8)', textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 'var(--r-xl)',
            background: 'var(--gradient-brand)', margin: '0 auto var(--sp-5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--glow-blue)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white" aria-hidden="true">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>

          <h1 style={{ fontFamily: 'var(--font-body)', fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 'var(--sp-2)' }}>
            Welcome <em style={{ fontStyle: 'normal', background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Back</em>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--sp-8)', lineHeight: 1.6 }}>
            Sign in to track orders, save your wishlist and check out faster next time.
          </p>

          {!googleAuthConfigured && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-5)', fontSize: '0.78rem', color: '#FCA5A5', textAlign: 'left' }}>
              <strong>Sign-in is currently unavailable.</strong> The site administrator has not configured Google OAuth. Try again later or message us on WhatsApp.
            </div>
          )}

          <button
            onClick={() => googleAuthConfigured && handleGoogleLogin()}
            disabled={loading || !googleAuthConfigured}
            className="btn btn-primary btn-full pulse-glow"
            style={{ display: 'inline-flex', justifyContent: 'center', gap: 'var(--sp-2)', alignItems: 'center', opacity: googleAuthConfigured ? 1 : 0.5 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#ffffff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#ffffff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#ffffff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#ffffff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? 'Signing in…' : 'Continue with Google'}
          </button>

          {error && (
            <p style={{ color: '#EF4444', fontSize: '0.8rem', marginTop: 'var(--sp-4)' }}>{error}</p>
          )}

          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--sp-6)', lineHeight: 1.6 }}>
            By signing in you agree to our <Link href="/terms" style={{ color: 'var(--accent-blue)' }}>Terms</Link> and <Link href="/privacy-policy" style={{ color: 'var(--accent-blue)' }}>Privacy Policy</Link>.
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: 'var(--sp-6)' }}>
          <Link href="/" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>← Back to home</Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="page-shell" />}>
      <LoginInner />
    </Suspense>
  );
}
