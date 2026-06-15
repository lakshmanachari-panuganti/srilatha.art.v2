'use client';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from './AuthProvider';
import { useState } from 'react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        setLoading(true);
        // useGoogleLogin returns an access_token. We need to fetch the user info manually.
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const userInfo = await res.json();
        
        // We'll mock a JWT payload for our AuthProvider since it expects a credential
        // In a real app with backend, you'd use the implicit flow or send the token to your backend
        // For simple frontend auth, we'll store the payload
        const syntheticToken = btoa(JSON.stringify({ alg: 'none' })) + '.' + btoa(JSON.stringify({
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
          exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiry
        })) + '.';
        
        login(syntheticToken);
        onClose();
      } catch (err) {
        setError('Failed to fetch user profile');
      } finally {
        setLoading(false);
      }
    },
    onError: () => setError('Google login failed'),
  });

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(9, 11, 16, 0.8)', backdropFilter: 'blur(8px)', padding: 'var(--sp-4)'
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 'var(--sp-8)', position: 'relative' }}>
        <button 
          onClick={onClose} 
          style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
          aria-label="Close"
        >
          &times;
        </button>
        
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 'var(--sp-2)', textAlign: 'center' }}>
          Welcome Back
        </h2>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 'var(--sp-6)', fontSize: '0.9rem' }}>
          Sign in to access your orders and saved items
        </p>

        <button 
          onClick={() => handleGoogleLogin()}
          disabled={loading}
          className="btn btn-primary btn-full pulse-glow"
          style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#ffffff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#ffffff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#ffffff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#ffffff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? 'Please wait...' : 'Continue with Google'}
        </button>
        
        {error && <p style={{ color: '#EF4444', fontSize: '0.8rem', marginTop: 'var(--sp-3)', textAlign: 'center' }}>{error}</p>}
      </div>
    </div>
  );
}
