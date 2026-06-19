'use client';
import { useState } from 'react';
import AccountShell from '@/components/auth/AccountShell';
import { useAuth } from '@/components/auth/AuthProvider';

export default function SettingsPage() {
  const { user } = useAuth();
  const [phone, setPhone] = useState('');
  const [saved, setSaved] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      localStorage.setItem('srilatha_user_phone', phone);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    }
  }

  if (!user) return null;

  return (
    <AccountShell currentLabel="Settings">
      <div className="account-content-inner">
        <div className="account-section-header">
          <h2 className="account-section-title">Account Settings</h2>
        </div>

        <form onSubmit={handleSave} className="card" style={{ padding: 'var(--sp-6)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)', maxWidth: 520 }}>
          <div>
            <label className="form-label" htmlFor="settings-name">Full Name</label>
            <input id="settings-name" className="form-input" value={user.name ?? ''} disabled />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Synced from your Google account.</span>
          </div>

          <div>
            <label className="form-label" htmlFor="settings-email">Email</label>
            <input id="settings-email" className="form-input" value={user.email} disabled />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Synced from your Google account.</span>
          </div>

          <div>
            <label className="form-label" htmlFor="settings-phone">WhatsApp / Phone</label>
            <input
              id="settings-phone"
              type="tel"
              className="form-input"
              placeholder="+91 9XXXXXXXXX"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Used for order updates.</span>
          </div>

          <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
            <button type="submit" className="btn btn-primary">Save</button>
            {saved && <span style={{ fontSize: '0.85rem', color: 'var(--accent-green)' }}>✓ Saved</span>}
          </div>
        </form>
      </div>
    </AccountShell>
  );
}
