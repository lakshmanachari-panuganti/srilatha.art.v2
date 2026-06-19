'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

const NAV = [
  { href: '/account',           label: 'Profile',   icon: '👤' },
  { href: '/account/orders',    label: 'Orders',    icon: '📦' },
  { href: '/account/wishlist',  label: 'Wishlist',  icon: '♥' },
  { href: '/account/settings',  label: 'Settings',  icon: '⚙' },
];

function initials(name?: string) {
  if (!name) return 'U';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function AccountShell({ children, currentLabel }: { children: React.ReactNode; currentLabel: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Give AuthProvider one tick to hydrate from localStorage
    const t = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, user, pathname, router]);

  if (!ready || !user) {
    return (
      <div className="page-shell">
        <div className="container" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading account…</div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className="breadcrumb-sep">›</span>
          <Link href="/account">My Account</Link>
          <span className="breadcrumb-sep">›</span>
          <span className="current">{currentLabel}</span>
        </nav>

        <button
          className="account-mobile-toggle"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open account menu"
        >
          ☰ Account Menu
        </button>

        <div className="account-layout">
          {sidebarOpen && <div className="account-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

          <aside className={`account-sidebar${sidebarOpen ? ' open' : ''}`} aria-label="Account navigation">
            <button className="account-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">✕</button>

            <div className="account-sidebar-profile">
              <div className="account-avatar account-avatar-sm">{initials(user.name)}</div>
              <div>
                <div className="account-sidebar-name">{user.name}</div>
                <div className="account-sidebar-email">{user.email}</div>
              </div>
            </div>

            <nav className="account-nav">
              {NAV.map(item => {
                const active = item.href === '/account' ? pathname === '/account' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`account-nav-item${active ? ' active' : ''}`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <span className="account-nav-icon">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="account-sidebar-footer">
              <button className="account-logout-btn" onClick={() => { logout(); router.push('/'); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
                </svg>
                Sign Out
              </button>
            </div>
          </aside>

          <main className="account-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
