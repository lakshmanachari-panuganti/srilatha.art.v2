'use client';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth, useIsGoogleAuthConfigured } from './AuthProvider';
import { useEffect, useState } from 'react';
import {
  authLogin,
  authRegister,
  authGoogle,
  forgotPasswordRequest,
  forgotPasswordVerify,
  forgotPasswordReset,
  ApiError,
} from '@/lib/api';
import Link from 'next/link';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'signin' | 'register';
}

type Tab = 'signin' | 'register' | 'forgot';
type ForgotStep = 'phone' | 'otp' | 'password';

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
  const googleAuthConfigured = useIsGoogleAuthConfigured();
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  // Sign-in form state — identifier is email OR phone
  const [siIdentifier, setSiIdentifier] = useState('');
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

  // Forgot password state
  const [fStep, setFStep] = useState<ForgotStep>('phone');
  const [fPhone, setFPhone] = useState('');
  const [fOtp, setFOtp] = useState('');
  const [fResetToken, setFResetToken] = useState('');
  const [fNewPw, setFNewPw] = useState('');
  const [fConfirmPw, setFConfirmPw] = useState('');
  const [fValidity, setFValidity] = useState(15);

  useEffect(() => {
    if (isOpen) {
      setError(''); setInfo('');
      setTab(defaultTab);
      setFStep('phone'); setFOtp(''); setFResetToken(''); setFNewPw(''); setFConfirmPw('');
    }
  }, [isOpen, defaultTab]);

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        setLoading(true);
        setError('');
        const res = await authGoogle({ accessToken: tokenResponse.access_token });
        login(res.token);
        onClose();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Google sign-in failed. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    onError: () => setError('Google sign-in was cancelled.'),
  });

  const submitSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!siIdentifier || !siPassword) { setError('Please enter your email/phone and password.'); return; }
    try {
      setLoading(true);
      const res = await authLogin({ identifier: siIdentifier, password: siPassword });
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

  const submitForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!fPhone.trim()) { setError('Please enter your registered phone number.'); return; }
    try {
      setLoading(true);
      const res = await forgotPasswordRequest({ phone: fPhone.trim() });
      setFValidity(res.validityMinutes);
      if (res.devOtp) setFOtp(res.devOtp);   // operator-enabled fallback
      // Only claim WhatsApp delivery when the backend actually confirmed it.
      // If devOtp is present, the operator turned on the fallback and the
      // code has been pre-filled — say so honestly.
      if (res.sent) {
        setInfo(`We've sent a 6-digit OTP via WhatsApp. It's valid for ${res.validityMinutes} minutes.`);
      } else if (res.devOtp) {
        setInfo(`The OTP has been pre-filled for you. It's valid for ${res.validityMinutes} minutes.`);
      } else {
        setInfo(`A 6-digit OTP has been generated and is valid for ${res.validityMinutes} minutes.`);
      }
      setFStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start password reset. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const submitForgotVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!fOtp || fOtp.length < 4) { setError('Please enter the OTP from WhatsApp.'); return; }
    try {
      setLoading(true);
      const res = await forgotPasswordVerify({ phone: fPhone.trim(), otp: fOtp.trim() });
      setFResetToken(res.resetToken);
      setInfo('OTP verified. Choose a new password.');
      setFStep('password');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid or expired OTP.');
    } finally {
      setLoading(false);
    }
  };

  const submitForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (fNewPw.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (fNewPw !== fConfirmPw) { setError('Passwords do not match.'); return; }
    try {
      setLoading(true);
      const res = await forgotPasswordReset({ resetToken: fResetToken, newPassword: fNewPw });
      login(res.token);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset password. Please try again.');
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
          <p className="auth-subtitle">
            {tab === 'forgot' ? 'Reset your password with WhatsApp OTP' : 'Sign in to your account or create a new one'}
          </p>
        </div>

        {tab !== 'forgot' && (
          <div className="auth-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'signin'}
              className={`auth-tab ${tab === 'signin' ? 'is-active' : ''}`}
              onClick={() => { setTab('signin'); setError(''); setInfo(''); }}
            >
              Sign in
            </button>
            <button
              role="tab"
              aria-selected={tab === 'register'}
              className={`auth-tab ${tab === 'register' ? 'is-active' : ''}`}
              onClick={() => { setTab('register'); setError(''); setInfo(''); }}
            >
              Create account
            </button>
          </div>
        )}

        {tab === 'signin' && (
          <div className="auth-panel">
            <button
              type="button"
              onClick={() => googleAuthConfigured && handleGoogleLogin()}
              disabled={loading || !googleAuthConfigured}
              className="auth-google-btn"
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>

            <div className="auth-divider"><span>OR</span></div>

            <form onSubmit={submitSignin} className="auth-form" noValidate>
              <label className="auth-field">
                <span className="auth-label">Email or phone <em>*</em></span>
                <input
                  type="text"
                  autoComplete="username"
                  required
                  placeholder="you@example.com or +91 98765 43210"
                  className="auth-input"
                  value={siIdentifier}
                  onChange={(e) => setSiIdentifier(e.target.value)}
                  data-testid="login-identifier"
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
                    data-testid="login-password"
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

              {error && <p className="auth-error" data-testid="auth-error">{error}</p>}

              <button type="submit" disabled={loading} data-testid="login-submit" className="btn btn-primary btn-full pulse-glow auth-submit">
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="auth-switch">
              <button
                type="button"
                className="auth-link"
                data-testid="forgot-password-link"
                onClick={() => { setTab('forgot'); setError(''); setInfo(''); setFStep('phone'); }}
              >
                Forgot your password?
              </button>
            </p>

            <p className="auth-switch">
              Don&apos;t have an account?{' '}
              <button type="button" className="auth-link" onClick={() => { setTab('register'); setError(''); setInfo(''); }}>Create one</button>
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
                  data-testid="register-name"
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
                  data-testid="register-email"
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
                    data-testid="register-password"
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
                    data-testid="register-confirm"
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
                  data-testid="register-mobile"
                />
              </label>

              {error && <p className="auth-error" data-testid="auth-error">{error}</p>}

              <button type="submit" disabled={loading} data-testid="register-submit" className="btn btn-primary btn-full pulse-glow auth-submit">
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>

            <div className="auth-divider"><span>OR SIGN UP WITH</span></div>

            <button
              type="button"
              onClick={() => googleAuthConfigured && handleGoogleLogin()}
              disabled={loading || !googleAuthConfigured}
              className="auth-google-btn"
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>

            <p className="auth-switch">
              Already have an account?{' '}
              <button type="button" className="auth-link" onClick={() => { setTab('signin'); setError(''); setInfo(''); }}>Sign in</button>
            </p>
          </div>
        )}

        {tab === 'forgot' && (
          <div className="auth-panel">
            {fStep === 'phone' && (
              <form onSubmit={submitForgotRequest} className="auth-form" noValidate>
                <label className="auth-field">
                  <span className="auth-label">Registered phone number <em>*</em></span>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    placeholder="+91 98765 43210"
                    className="auth-input"
                    value={fPhone}
                    onChange={(e) => setFPhone(e.target.value)}
                    data-testid="forgot-phone"
                  />
                </label>
                {info && <p className="auth-info" data-testid="auth-info">{info}</p>}
                {error && <p className="auth-error" data-testid="auth-error">{error}</p>}
                <button type="submit" disabled={loading} data-testid="forgot-request-submit" className="btn btn-primary btn-full pulse-glow auth-submit">
                  {loading ? 'Sending OTP…' : 'Send OTP on WhatsApp'}
                </button>
              </form>
            )}

            {fStep === 'otp' && (
              <form onSubmit={submitForgotVerify} className="auth-form" noValidate>
                <label className="auth-field">
                  <span className="auth-label">Enter OTP <em>*</em></span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    placeholder="6-digit code"
                    className="auth-input"
                    value={fOtp}
                    onChange={(e) => setFOtp(e.target.value.replace(/\D/g, ''))}
                    data-testid="forgot-otp"
                  />
                </label>
                {info && <p className="auth-info" data-testid="auth-info">{info}</p>}
                {error && <p className="auth-error" data-testid="auth-error">{error}</p>}
                <button type="submit" disabled={loading} data-testid="forgot-verify-submit" className="btn btn-primary btn-full pulse-glow auth-submit">
                  {loading ? 'Verifying…' : 'Verify OTP'}
                </button>
                <p className="auth-switch">
                  Code valid for {fValidity} minutes.{' '}
                  <button type="button" className="auth-link" onClick={() => { setFStep('phone'); setInfo(''); setError(''); }}>
                    Use a different number
                  </button>
                </p>
              </form>
            )}

            {fStep === 'password' && (
              <form onSubmit={submitForgotReset} className="auth-form" noValidate>
                <label className="auth-field">
                  <span className="auth-label">New password <em>*</em></span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    placeholder="Min. 8 characters"
                    className="auth-input"
                    value={fNewPw}
                    onChange={(e) => setFNewPw(e.target.value)}
                    data-testid="forgot-new-password"
                  />
                </label>
                <label className="auth-field">
                  <span className="auth-label">Confirm password <em>*</em></span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    placeholder="Repeat password"
                    className="auth-input"
                    value={fConfirmPw}
                    onChange={(e) => setFConfirmPw(e.target.value)}
                    data-testid="forgot-confirm-password"
                  />
                </label>
                {info && <p className="auth-info" data-testid="auth-info">{info}</p>}
                {error && <p className="auth-error" data-testid="auth-error">{error}</p>}
                <button type="submit" disabled={loading} data-testid="forgot-reset-submit" className="btn btn-primary btn-full pulse-glow auth-submit">
                  {loading ? 'Resetting…' : 'Reset password & sign in'}
                </button>
              </form>
            )}

            <p className="auth-switch">
              Remembered it?{' '}
              <button type="button" className="auth-link" onClick={() => { setTab('signin'); setError(''); setInfo(''); }}>Back to sign in</button>
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
