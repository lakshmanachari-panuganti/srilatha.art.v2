'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAdminAuth } from './AdminAuthProvider';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Palette,
  Tag,
  Megaphone,
  Star,
  MessageCircle,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

const NAV = [
  { href: '/admin/dashboard',      label: 'Dashboard',       Icon: LayoutDashboard },
  { href: '/admin/orders',         label: 'Orders',          Icon: ShoppingCart },
  { href: '/admin/products',       label: 'Products',        Icon: Package },
  { href: '/admin/custom-orders',  label: 'Custom Orders',   Icon: Palette },
  { href: '/admin/coupons',        label: 'Coupons',         Icon: Tag },
  { href: '/admin/announcements',  label: 'Announcements',   Icon: Megaphone },
  { href: '/admin/reviews',        label: 'Reviews',         Icon: Star },
  { href: '/admin/whatsapp',       label: 'WhatsApp',        Icon: MessageCircle },
  { href: '/admin/settings',       label: 'Settings',        Icon: Settings },
];

interface AdminShellProps { children: React.ReactNode; title: string }

export default function AdminShell({ children, title }: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { admin, ready, logout } = useAdminAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (ready && !admin) router.replace(`/admin?next=${encodeURIComponent(pathname)}`);
  }, [ready, admin, pathname, router]);

  if (!ready || !admin) {
    return (
      <div className="page-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Checking session…</p>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      {/* Top bar */}
      <header className="admin-topbar">
        <button className="admin-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <Link href="/admin/dashboard" className="admin-brand">
          Srilatha<span>Admin</span>
        </Link>
        <div style={{ flex: 1 }} />
        <div className="admin-user">
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{admin.name}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{admin.role}</div>
          </div>
        </div>
      </header>

      <div className="admin-body">
        {sidebarOpen && <div className="admin-overlay" onClick={() => setSidebarOpen(false)} />}

        <aside className={`admin-sidebar${sidebarOpen ? ' open' : ''}`}>
          <button className="admin-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close">
            <X size={20} />
          </button>
          <nav className="admin-nav">
            {NAV.map(item => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.Icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`admin-nav-item${active ? ' active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon size={16} strokeWidth={1.7} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="admin-sidebar-footer">
            <button
              className="admin-logout"
              onClick={() => { logout(); router.replace('/admin'); }}
            >
              <LogOut size={16} />
              Sign Out
            </button>
            <Link href="/" className="admin-back-to-shop">View Storefront →</Link>
          </div>
        </aside>

        <main className="admin-main">
          <div className="admin-page-header">
            <h1 className="admin-page-title">{title}</h1>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
