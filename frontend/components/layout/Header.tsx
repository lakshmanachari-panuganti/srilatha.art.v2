'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '@/components/cart/CartProvider';
import CartDrawer from '@/components/cart/CartDrawer';
import AuthModal from '@/components/auth/AuthModal';
import { useAuth } from '@/components/auth/AuthProvider';
import { CONTACT, waLink } from '@/lib/contact';
import { CATEGORY_META } from '@/lib/categoryIcons';

const COLLECTIONS_LINKS = CATEGORY_META
  .filter(c => c.id !== 'all')
  .map(c => ({
    href: `/shop?category=${c.id}`,
    label: c.label,
    Icon: c.Icon,
    badge: c.id === 'resin' ? 'PRIMARY' as const : undefined,
  }));

const NAV_LINKS = [
  { href: '/',              label: 'Home' },
  { href: '/shop',          label: 'Shop' },
  { href: '/custom-order',  label: 'Custom Order' },
  { href: '/about',         label: 'About' },
  { href: '/contact',       label: 'Contact' },
];

export default function Header() {
  const pathname = usePathname();
  const { itemCount, openCart } = useCart();
  // Admin section has its own AdminShell chrome.
  const isAdmin = pathname.startsWith('/admin');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  
  // Auth state
  const { user, logout } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileCollectionsOpen, setMobileCollectionsOpen] = useState(false);

  const [wishlistCount, setWishlistCount] = useState(0);

  const collectionsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (collectionsRef.current && !collectionsRef.current.contains(e.target as Node)) {
        setCollectionsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    let lastY = window.scrollY;
    const handler = () => {
      const y = window.scrollY;
      setScrolled(y > 10);
      // Only auto-hide on small screens and after scrolling past 120px
      if (window.innerWidth < 1024 && y > 120) {
        setHidden(y > lastY);
      } else {
        setHidden(false);
      }
      lastY = y;
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    document.body.style.overflow = drawerOpen || authModalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen, authModalOpen]);

  useEffect(() => {
    const readCount = () => {
      try {
        const list = JSON.parse(localStorage.getItem('srilatha_wishlist') ?? '[]');
        setWishlistCount(Array.isArray(list) ? list.length : 0);
      } catch { setWishlistCount(0); }
    };
    readCount();
    // Update when storage changes (other tabs) or pathname changes (in-tab nav)
    window.addEventListener('storage', readCount);
    return () => window.removeEventListener('storage', readCount);
  }, [pathname]);

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);

  if (isAdmin) return null;

  return (
    <>
      <header
        className="site-header"
        style={{
          boxShadow: scrolled ? '0 1px 40px rgba(0,0,0,0.5)' : 'none',
          transform: hidden ? 'translateY(-100%)' : 'translateY(0)',
          transition: 'box-shadow 0.3s ease, transform 0.3s ease',
        }}
      >
        <div className="header-inner">
          {/* Logo */}
          <Link href="/" className="header-logo" aria-label="Srilatha Art home">
            <div className="header-logo-mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                <path d="M16 2C16 2 8 10 8 18C8 22.4183 11.5817 26 16 26C20.4183 26 24 22.4183 24 18C24 10 16 2 16 2Z" fill="white" fillOpacity="0.9"/>
                <circle cx="16" cy="20" r="3" fill="rgba(0,163,255,0.8)"/>
              </svg>
            </div>
            <div>
              <div className="header-logo-text">
                Srilatha<span>Art</span>
              </div>
              <span className="header-logo-sub">Handcrafted with Love</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="header-nav" aria-label="Main navigation">
            {NAV_LINKS.map(link => (
              link.label === 'Shop' ? (
                <div key="shop" className="header-nav-dropdown" ref={collectionsRef}>
                  <button
                    onClick={() => setCollectionsOpen(v => !v)}
                    className={`header-nav-link ${isActive('/shop') ? 'active' : ''}`}
                    style={{
                      fontSize: '0.875rem', fontWeight: 500,
                      color: isActive('/shop') ? 'var(--accent-blue)' : 'var(--text-secondary)',
                      padding: '6px 14px', borderRadius: 'var(--r-full)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                      transition: 'color 0.15s, background 0.15s',
                    }}
                  >
                    Collections
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5, transform: collectionsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </button>
                  {collectionsOpen && (
                    <div className="header-nav-dropdown-menu" style={{ opacity: 1, pointerEvents: 'all' }}>
                      <Link href="/shop" onClick={() => setCollectionsOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                        <span style={{ display: 'inline-flex', width: 16 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                        </span>
                        All Collections
                      </Link>
                      {COLLECTIONS_LINKS.map(c => {
                        const Icon = c.Icon;
                        return (
                          <Link key={c.href} href={c.href} onClick={() => setCollectionsOpen(false)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)' }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <Icon size={16} aria-hidden="true" />
                              {c.label}
                            </span>
                            {c.badge && <span className="badge badge-gold" style={{ fontSize: '0.6rem' }}>{c.badge}</span>}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className={isActive(link.href) ? 'active' : ''}
                  style={{
                    fontSize: '0.875rem', fontWeight: 500,
                    color: isActive(link.href) ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    padding: '6px 14px', borderRadius: 'var(--r-full)',
                    transition: 'color 0.15s, background 0.15s',
                  }}
                >
                  {link.label}
                </Link>
              )
            ))}
          </nav>

          {/* Actions */}
          <div className="header-actions">
            {/* Search — visible on all viewports */}
            <button
              onClick={() => setSearchOpen(v => !v)}
              className="header-icon-btn"
              aria-label="Search"
              aria-expanded={searchOpen}
              id="header-search-btn"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </button>

            {/* Wishlist — desktop only */}
            <Link
              href="/account/wishlist"
              className="header-icon-btn"
              aria-label={`Wishlist — ${wishlistCount} items`}
              style={{ display: 'none', position: 'relative' }}
              id="header-wishlist-btn"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              {wishlistCount > 0 && (
                <span className="cart-badge">{wishlistCount > 9 ? '9+' : wishlistCount}</span>
              )}
            </Link>

            {/* Cart */}
            <button onClick={openCart} className="header-icon-btn" aria-label={`Cart — ${itemCount} items`} style={{ position: 'relative' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              {itemCount > 0 && (
                <span className="cart-badge">{itemCount > 9 ? '9+' : itemCount}</span>
              )}
            </button>

            {/* Account */}
            <div style={{ position: 'relative' }} ref={userMenuRef}>
              <button 
                onClick={() => user ? setUserMenuOpen(!userMenuOpen) : setAuthModalOpen(true)} 
                className="header-icon-btn" 
                aria-label="Account" 
                id="header-account-btn"
              >
                {user && user.picture ? (
                  <img src={user.picture} alt="Profile" style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--border-mid)' }} />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                )}
              </button>

              {userMenuOpen && user && (
                <div className="header-nav-dropdown-menu" style={{ opacity: 1, pointerEvents: 'all', right: 0, left: 'auto', minWidth: 220 }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{user.name || 'User'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
                  </div>
                  <Link href="/account" onClick={() => setUserMenuOpen(false)} style={{ display: 'block', padding: '8px 16px', fontSize: '0.85rem' }}>
                    My Account
                  </Link>
                  <Link href="/account/orders" onClick={() => setUserMenuOpen(false)} style={{ display: 'block', padding: '8px 16px', fontSize: '0.85rem' }}>
                    Orders
                  </Link>
                  <Link href="/account/wishlist" onClick={() => setUserMenuOpen(false)} style={{ display: 'block', padding: '8px 16px', fontSize: '0.85rem' }}>
                    Wishlist
                  </Link>
                  <Link href="/account/settings" onClick={() => setUserMenuOpen(false)} style={{ display: 'block', padding: '8px 16px', fontSize: '0.85rem' }}>
                    Settings
                  </Link>
                  <button
                    onClick={() => { logout(); setUserMenuOpen(false); }}
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 16px', fontSize: '0.85rem', color: '#EF4444', cursor: 'pointer', marginTop: 4 }}
                  >
                    Log Out
                  </button>
                </div>
              )}
            </div>

            {/* CTA button — desktop: "Shop Now", mobile: hidden (bottom bar handles it) */}
            <Link
              href="/shop?category=resin"
              className="btn btn-primary btn-sm"
              id="header-cta-btn"
              style={{ fontWeight: 700 }}
            >
              Shop Now
            </Link>

            {/* Hamburger — mobile only */}
            <button
              className="hamburger-btn"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>

        {/* Search Overlay */}
        {searchOpen && (
          <div className="header-search-bar open">
            <input
              type="search"
              placeholder="Search for resin art, lippan art, mandala..."
              className="header-search-input"
              autoFocus
              onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
            />
          </div>
        )}
      </header>

      {/* Mobile Drawer */}
      <div
        className={`mobile-nav-overlay ${drawerOpen ? 'open' : ''}`}
        onClick={() => { setDrawerOpen(false); setMobileCollectionsOpen(false); }}
        aria-hidden="true"
      />

      <aside
        className={`mobile-nav-drawer ${drawerOpen ? 'open' : ''}`}
        aria-label="Mobile navigation"
        role="dialog"
        aria-modal="true"
      >
        <div className="mobile-nav-header">
          <Link href="/" className="header-logo" onClick={() => { setDrawerOpen(false); setMobileCollectionsOpen(false); }}>
            <div className="header-logo-mark">🎨</div>
            <div className="header-logo-text">Srilatha<span>Art</span></div>
          </Link>
          <button
            onClick={() => { setDrawerOpen(false); setMobileCollectionsOpen(false); }}
            aria-label="Close menu"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Mobile CTA */}
        <Link href="/shop?category=resin" onClick={() => { setDrawerOpen(false); setMobileCollectionsOpen(false); }} className="btn btn-primary btn-full" style={{ marginBottom: 'var(--sp-5)' }}>
          ⚡ Shop Resin Art
        </Link>

        <nav className="mobile-nav-links">
          {NAV_LINKS.filter(link => link.href !== '/').map(link => (
            <Link key={link.href} href={link.href} onClick={() => { setDrawerOpen(false); setMobileCollectionsOpen(false); }} className={isActive(link.href) ? 'active' : ''}>
              {link.label}
            </Link>
          ))}

          {/* Collapsible Collections */}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 'var(--sp-2)', paddingTop: 'var(--sp-2)' }}>
            <button 
              onClick={() => setMobileCollectionsOpen(!mobileCollectionsOpen)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: '12px 16px', fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              Collections
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: mobileCollectionsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            
            <div style={{ 
              overflow: 'hidden', 
              transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
              maxHeight: mobileCollectionsOpen ? '500px' : '0',
              opacity: mobileCollectionsOpen ? 1 : 0
            }}>
              <div style={{ padding: '0 var(--sp-4) var(--sp-2)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                {COLLECTIONS_LINKS.map(c => {
                  const Icon = c.Icon;
                  return (
                    <Link key={c.href} href={c.href} onClick={() => { setDrawerOpen(false); setMobileCollectionsOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      <Icon size={16} aria-hidden="true" />
                      {c.label}
                      {c.badge && <span className="badge badge-gold" style={{ transform: 'scale(0.8)', transformOrigin: 'left center' }}>{c.badge}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          <Link href="/sale" onClick={() => { setDrawerOpen(false); setMobileCollectionsOpen(false); }} style={{ color: '#FF6B6B', padding: '12px 16px', display: 'block', fontWeight: 500 }}>🔥 Sale</Link>
        </nav>

        {/* Mobile footer */}
        <div style={{ marginTop: 'auto', paddingTop: 'var(--sp-6)', borderTop: '1px solid var(--border)' }}>
          <a
            href={waLink("Hi! I'm interested in your handmade art")}
            className="btn btn-whatsapp btn-full"
            target="_blank" rel="noopener noreferrer"
            style={{ marginBottom: 'var(--sp-3)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Chat with Srilatha
          </a>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>{CONTACT.email} · {CONTACT.phoneDisplay}</p>
        </div>
      </aside>

      <CartDrawer />

      <AuthModal 
        isOpen={authModalOpen} 
        onClose={() => setAuthModalOpen(false)} 
      />

      <style>{`
        #header-wishlist-btn { display: none; }
        @media (min-width: 1024px) {
          #header-wishlist-btn { display: flex; }
          .hamburger-btn { display: none !important; }
          #header-cta-btn { display: inline-flex; }
        }
        @media (max-width: 1023px) {
          #header-cta-btn { display: none; }
        }
        .header-search-bar {
          position: absolute; top: 100%; left: 0; right: 0;
          background: rgba(9,11,16,0.98); backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border-mid);
          padding: var(--sp-4) var(--sp-8); z-index: 99;
        }
        .header-search-input {
          width: 100%; max-width: 600px; margin: 0 auto; display: block;
          padding: 12px 20px; border: 1.5px solid var(--accent-blue);
          border-radius: var(--r-full); font-size: 1rem; outline: none;
          background: var(--bg-elevated); color: var(--text-primary);
        }
        .header-search-input::placeholder { color: var(--text-muted); }
      `}</style>
    </>
  );
}
