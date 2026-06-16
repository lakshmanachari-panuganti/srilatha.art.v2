'use client';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth, GOOGLE_CLIENT_ID_CONFIGURED } from './AuthProvider';
import { useEffect, useState } from 'react';
import { authLogin, authRegister, ApiError } from '@/lib/api';
import Link from 'next/link';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'signin' | 'register';
}

type Tab = 'signin' | 'register';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const EyeIcon = ({ open }: { open: boolean }) => (
  open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
);

export default function AuthModal({ isOpen, onClose, defaultTab = 'signin' }: AuthModalProps) {
  const { login } = useAuth();
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Sign-in form state
  const [siEmail, setSiEmail] = useState('');
  const [siPassword, setSiPassword] = useState('');
  const [siShowPw, setSiShowPw] = useState(false);

  // Register form state
  const [rName, setRName] = useState('');
  const [rEmail, setREmail] = useState('');
  const [rPassword, setRPassword] = useState('');
  const [rConfirm, setRConfirm] = useState('');
  const [rMobile, setRMobile] = useState('');
  const [rShowPw, setRShowPw] = useState(false);
  const [rShowConfirm, setRShowConfirm] = useState(false);

  useEffect(() => { if (isOpen) { setError(''); setTab(defaultTab); } }, [isOpen, defaultTab]);

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        setLoading(true);
        setError('');
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const userInfo = await res.json();
        const syntheticToken =
          btoa(JSON.stringify({ alg: 'none' })) + '.' +
          btoa(JSON.stringify({
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
            exp: Math.floor(Date.now() / 1000) + 3600,
          })) + '.';
        login(syntheticToken);
        onClose();
      } catch (err) {
        setError('Failed to fetch profile. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    onError: () => setError('Google sign-in was cancelled.'),
  });

  const submitSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!siEmail || !siPassword) { setError('Please enter your email and password.'); return; }
    try {
      setLoading(true);
      const res = await authLogin({ email: siEmail, password: siPassword });
      login(res.token);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!rName.trim() || !rEmail || !rPassword) { setError('Name, email and password are required.'); return; }
    if (rPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (rPassword !== rConfirm) { setError('Passwords do not match.'); return; }
    try {
      setLoading(true);
      const res = await authRegister({
        name: rName.trim(),
        email: rEmail,
        password: rPassword,
        mobile: rMobile.trim() || undefined,
      });
      login(res.token);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="auth-backdrop" onClick={onClose}>
      <div className="auth-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button onClick={onClose} className="auth-close" aria-label="Close">×</button>

        <div className="auth-header">
          <span className="eyebrow auth-eyebrow">Welcome</span>
          <h2 id="auth-title" className="auth-title">
            Srilatha&nbsp;<span className="auth-title-grad">Art</span>
          </h2>
          <p className="auth-subtitle">Sign in to your account or create a new one</p>
        </div>

        <div className="auth-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'signin'}
            className={`auth-tab ${tab === 'signin' ? 'is-active' : ''}`}
            onClick={() => { setTab('signin'); setError(''); }}
          >
            Sign in
          </button>
          <button
            role="tab"
            aria-selected={tab === 'register'}
            className={`auth-tab ${tab === 'register' ? 'is-active' : ''}`}
            onClick={() => { setTab('register'); setError(''); }}
          >
            Create account
          </button>
        </div>

        {tab === 'signin' && (
          <div className="auth-panel">
            <button
              type="button"
              onClick={() => GOOGLE_CLIENT_ID_CONFIGURED && handleGoogleLogin()}
              disabled={loading || !GOOGLE_CLIENT_ID_CONFIGURED}
              className="auth-google-btn"
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>

            <div className="auth-divider"><span>OR</span></div>

            <form onSubmit={submitSignin} className="auth-form" noValidate>
              <label className="auth-field">
                <span className="auth-label">Email address <em>*</em></span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  className="auth-input"
                  value={siEmail}
                  onChange={(e) => setSiEmail(e.target.value)}
                />
              </label>

              <label className="auth-field">
                <span className="auth-label">Password <em>*</em></span>
                <div className="auth-input-wrap">
                  <input
                    type={siShowPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    className="auth-input"
                    value={siPassword}
                    onChange={(e) => setSiPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setSiShowPw(v => !v)}
                    className="auth-eye"
                    aria-label={siShowPw ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon open={siShowPw} />
                  </button>
                </div>
              </label>

              {error && <p className="auth-error">{error}</p>}

              <button type="submit" disabled={loading} className="btn btn-primary btn-full pulse-glow auth-submit">
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="auth-switch">
              Don&apos;t have an account?{' '}
              <button type="button" className="auth-link" onClick={() => { setTab('register'); setError(''); }}>Create one</button>
            </p>
          </div>
        )}

        {tab === 'register' && (
          <div className="auth-panel">
            <form onSubmit={submitRegister} className="auth-form" noValidate>
              <label className="auth-field">
                <span className="auth-label">Full name <em>*</em></span>
                <input
                  type="text"
                  autoComplete="name"
                  required
                  placeholder="Your name"
                  className="auth-input"
                  value={rName}
                  onChange={(e) => setRName(e.target.value)}
                />
              </label>

              <label className="auth-field">
                <span className="auth-label">Email address <em>*</em></span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  className="auth-input"
                  value={rEmail}
                  onChange={(e) => setREmail(e.target.value)}
                />
              </label>

              <label className="auth-field">
                <span className="auth-label">Password <em>*</em></span>
                <div className="auth-input-wrap">
                  <input
                    type={rShowPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="Min. 8 characters"
                    className="auth-input"
                    value={rPassword}
                    onChange={(e) => setRPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setRShowPw(v => !v)} className="auth-eye" aria-label={rShowPw ? 'Hide password' : 'Show password'}>
                    <EyeIcon open={rShowPw} />
                  </button>
                </div>
              </label>

              <label className="auth-field">
                <span className="auth-label">Confirm password <em>*</em></span>
                <div className="auth-input-wrap">
                  <input
                    type={rShowConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    placeholder="Repeat password"
                    className="auth-input"
                    value={rConfirm}
                    onChange={(e) => setRConfirm(e.target.value)}
                  />
                  <button type="button" onClick={() => setRShowConfirm(v => !v)} className="auth-eye" aria-label={rShowConfirm ? 'Hide password' : 'Show password'}>
                    <EyeIcon open={rShowConfirm} />
                  </button>
                </div>
              </label>

              <label className="auth-field">
                <span className="auth-label">Mobile number <span className="auth-optional">(optional)</span></span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+91 98765 43210"
                  className="auth-input"
                  value={rMobile}
                  onChange={(e) => setRMobile(e.target.value)}
                />
              </label>

              {error && <p className="auth-error">{error}</p>}

              <button type="submit" disabled={loading} className="btn btn-primary btn-full pulse-glow auth-submit">
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>

            <div className="auth-divider"><span>OR SIGN UP WITH</span></div>

            <button
              type="button"
              onClick={() => GOOGLE_CLIENT_ID_CONFIGURED && handleGoogleLogin()}
              disabled={loading || !GOOGLE_CLIENT_ID_CONFIGURED}
              className="auth-google-btn"
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>

            <p className="auth-switch">
              Already have an account?{' '}
              <button type="button" className="auth-link" onClick={() => { setTab('signin'); setError(''); }}>Sign in</button>
            </p>
          </div>
        )}

        <p className="auth-terms">
          By continuing you agree to our{' '}
          <Link href="/terms" onClick={onClose}>Terms</Link> and{' '}
          <Link href="/privacy-policy" onClick={onClose}>Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
