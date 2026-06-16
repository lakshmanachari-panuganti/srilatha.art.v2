'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CONTACT, waLink } from '@/lib/contact';

const QUICK_LINKS   = [{ href: '/shop', label: 'Shop' }, { href: '/custom-order', label: 'Custom Order' }, { href: '/about', label: 'About' }, { href: '/contact', label: 'Contact' }];
const COLLECTIONS   = [{ href: '/shop?category=resin', label: 'Resin Art' }, { href: '/shop?category=lippan', label: 'Lippan Art' }, { href: '/shop?category=mandala', label: 'Dot Mandala' }, { href: '/shop?category=kolam', label: 'Kolam Art' }, { href: '/shop?category=wedding', label: 'Wedding Decor' }, { href: '/shop?category=gifts', label: 'Gift Sets' }];
const INFO_LINKS    = [{ href: '/faq', label: 'FAQ' }, { href: '/shipping-returns', label: 'Shipping & Returns' }, { href: '/care-guide', label: 'Care Guide' }, { href: '/privacy-policy', label: 'Privacy Policy' }, { href: '/terms', label: 'Terms of Service' }];

const SOCIAL = [
  { label: 'Instagram', href: 'https://instagram.com/srilatha.art', icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>) },
  { label: 'Pinterest', href: 'https://pinterest.com', icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>) },
  { label: 'Facebook',  href: 'https://facebook.com', icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>) },
  { label: 'YouTube',   href: 'https://youtube.com',  icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>) },
];

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const pathname = usePathname();
  if (pathname.startsWith('/admin')) return null;

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          {/* Brand */}
          <div>
            <div className="footer-brand-logo">
              Srilatha<span>Art</span>
            </div>
            <div className="footer-brand-tagline">Handmade · One Piece at a Time</div>
            <p className="footer-brand-desc">
              Premium handmade Indian folk art.
              Resin Art, Lippan, Dot Mandala, Kolam & more.
              Every piece tells a story. Ships pan-India.
            </p>
            <div className="footer-social">
              {SOCIAL.map(s => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="footer-social-btn" aria-label={s.label}>
                  {s.icon}
                </a>
              ))}
            </div>

            {/* Newsletter mini */}
            <div style={{ marginTop: 'var(--sp-5)' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 'var(--sp-2)', fontWeight: 600 }}>Get 10% off your first order:</p>
              <form
                style={{ display: 'flex', gap: 'var(--sp-2)' }}
                onSubmit={(e) => {
                  e.preventDefault();
                  alert('Thanks for subscribing! Check your email for your discount code.');
                }}
              >
                <input
                  type="email"
                  placeholder="your@email.com"
                  required
                  style={{
                    flex: 1, padding: '8px 12px',
                    border: '1.5px solid var(--border-mid)', borderRadius: 'var(--r-full)',
                    background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                    fontSize: '0.82rem', outline: 'none', minWidth: 0,
                  }}
                />
                <button type="submit" className="btn btn-primary btn-sm">
                  Subscribe
                </button>
              </form>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <div className="footer-col-title">Quick Links</div>
            <ul className="footer-links">
              {QUICK_LINKS.map(l => <li key={l.href}><Link href={l.href}>{l.label}</Link></li>)}
            </ul>
          </div>

          {/* Collections */}
          <div>
            <div className="footer-col-title">Collections</div>
            <ul className="footer-links">
              {COLLECTIONS.map(l => <li key={l.href}><Link href={l.href}>{l.label}</Link></li>)}
            </ul>
          </div>

          {/* Support */}
          <div>
            <div className="footer-col-title">Support</div>
            <ul className="footer-links">
              {INFO_LINKS.map(l => <li key={l.href}><Link href={l.href}>{l.label}</Link></li>)}
            </ul>

            <div style={{ marginTop: 'var(--sp-6)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <a
                href={waLink('Hi! I have a question about your art.')}
                target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: '0.875rem', color: '#25D366', minHeight: 44, padding: '10px 0' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                {CONTACT.phoneDisplay}
              </a>
              <a href={`mailto:${CONTACT.email}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: '0.875rem', color: 'var(--text-muted)', minHeight: 44, padding: '10px 0' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                {CONTACT.email}
              </a>
              <address style={{ fontStyle: 'normal', fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {CONTACT.studioAddress.line1}, {CONTACT.studioAddress.line2},<br />
                {CONTACT.studioAddress.city}, {CONTACT.studioAddress.country}
              </address>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {CONTACT.hours}<br />
                Response within 24 hrs
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="footer-bottom">
          <p className="footer-bottom-text">
            © {currentYear} Srilatha Art · Handmade with ♥ in India
          </p>
          <div className="footer-bottom-links">
            <Link href="/privacy-policy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/sitemap.xml">Sitemap</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
