'use client';
import { useState } from 'react';

export default function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    // TODO: wire up to backend API
    setStatus('success');
    setEmail('');
  };

  if (status === 'success') {
    return (
      <div style={{
        textAlign: 'center', padding: 'var(--sp-6)',
        background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
        borderRadius: 'var(--r-xl)', color: 'var(--accent-green)',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: 'var(--sp-2)' }}>🎉</div>
        <p style={{ fontWeight: 700 }}>You&apos;re in! Check your inbox.</p>
        <p style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: 4 }}>
          Your 10% discount code is on its way.
        </p>
      </div>
    );
  }

  return (
    <form
      className="newsletter-form"
      onSubmit={handleSubmit}
      style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}
    >
      <input
        type="email"
        placeholder="your@email.com"
        className="newsletter-input"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        style={{ flex: 1, minWidth: 200 }}
        aria-label="Email address for newsletter"
      />
      <button type="submit" className="btn btn-primary">
        Subscribe →
      </button>
    </form>
  );
}
