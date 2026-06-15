'use client';
import Link from 'next/link';
import AccountShell from '@/components/auth/AccountShell';
import { useAuth } from '@/components/auth/AuthProvider';

function initials(name?: string) {
  if (!name) return 'U';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function AccountPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <AccountShell currentLabel="Profile">
      <div className="account-content-inner">
        <div className="account-profile-hero">
          {user.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.picture} alt="" className="account-avatar" style={{ objectFit: 'cover' }} />
          ) : (
            <div className="account-avatar">{initials(user.name)}</div>
          )}
          <div className="account-profile-info">
            <h2 className="account-profile-name">{user.name}</h2>
            <p className="account-profile-email">{user.email}</p>
          </div>
        </div>

        <div className="account-stats-grid">
          <Link href="/account/orders" className="account-stat-card" style={{ textDecoration: 'none' }}>
            <div className="account-stat-value">0</div>
            <div className="account-stat-label">Orders</div>
          </Link>
          <Link href="/account/wishlist" className="account-stat-card" style={{ textDecoration: 'none' }}>
            <div className="account-stat-value">—</div>
            <div className="account-stat-label">Wishlist</div>
          </Link>
          <Link href="/account/settings" className="account-stat-card" style={{ textDecoration: 'none' }}>
            <div className="account-stat-value">⚙</div>
            <div className="account-stat-label">Settings</div>
          </Link>
        </div>

        <div className="account-recent-orders">
          <div className="account-section-header">
            <h3 className="account-section-title">Recent Orders</h3>
            <Link href="/account/orders" className="account-section-link">View all →</Link>
          </div>
          <div className="account-placeholder" style={{ marginTop: 'var(--sp-4)' }}>
            <div className="account-placeholder-icon">📦</div>
            <h3 className="account-placeholder-title">No orders yet</h3>
            <p className="account-placeholder-desc">When you order, it&apos;ll appear here with live status.</p>
            <Link href="/shop" className="btn btn-primary btn-sm" style={{ marginTop: 16 }}>Browse the Shop</Link>
          </div>
        </div>
      </div>
    </AccountShell>
  );
}
