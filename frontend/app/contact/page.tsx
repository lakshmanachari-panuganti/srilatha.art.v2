import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import { CONTACT, waLink } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Talk to Srilatha directly — WhatsApp, email, Instagram. Studio in Chilkanagar, Uppal, Hyderabad.',
};

export default function ContactPage() {
  return (
    <div className="page-shell">
      <div className="container">
        <PageHeader eyebrow="Get in Touch" title={<>Talk to <em style={{ fontStyle: 'normal', background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Srilatha</em></>} description="The fastest way to reach us is WhatsApp. We reply within 24 hours, Monday to Saturday." currentLabel="Contact" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--sp-6)' }} className="contact-grid">
          {/* WhatsApp card */}
          <a href={waLink('Hi! I have a question.')} target="_blank" rel="noopener noreferrer" className="card" style={{ padding: 'var(--sp-6)', display: 'flex', gap: 'var(--sp-4)', alignItems: 'flex-start', textDecoration: 'none' }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--r-lg)', background: 'rgba(37,211,102,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </div>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>WhatsApp</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 4 }}>{CONTACT.phoneDisplay}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tap to chat — fastest response</p>
            </div>
          </a>

          {/* Email card */}
          <a href={`mailto:${CONTACT.email}`} className="card" style={{ padding: 'var(--sp-6)', display: 'flex', gap: 'var(--sp-4)', alignItems: 'flex-start', textDecoration: 'none' }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--r-lg)', background: 'rgba(0,163,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Email</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 4 }}>{CONTACT.email}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Reply within 24 hours</p>
            </div>
          </a>

          {/* Instagram card */}
          <a href={CONTACT.instagramUrl} target="_blank" rel="noopener noreferrer" className="card" style={{ padding: 'var(--sp-6)', display: 'flex', gap: 'var(--sp-4)', alignItems: 'flex-start', textDecoration: 'none' }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--r-lg)', background: 'rgba(0,163,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            </div>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Instagram</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 4 }}>@{CONTACT.instagramHandle}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Behind-the-scenes & new drops</p>
            </div>
          </a>

          {/* Studio address card */}
          <div className="card" style={{ padding: 'var(--sp-6)', display: 'flex', gap: 'var(--sp-4)', alignItems: 'flex-start' }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--r-lg)', background: 'rgba(0,163,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Studio</h2>
              <address style={{ fontStyle: 'normal', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {CONTACT.studioAddress.line1}, {CONTACT.studioAddress.line2},<br />
                {CONTACT.studioAddress.city}, {CONTACT.studioAddress.country}
              </address>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{CONTACT.hours}</p>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 'var(--sp-12)', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            For custom commissions, please use our <Link href="/custom-order" style={{ color: 'var(--accent-blue)' }}>custom-order form</Link> so we can capture your brief in one place.
          </p>
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) { .contact-grid { grid-template-columns: 1fr 1fr !important; } }
      `}</style>
    </div>
  );
}
