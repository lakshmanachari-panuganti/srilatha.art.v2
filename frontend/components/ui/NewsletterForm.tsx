'use client';
import { CONTACT, waLink } from '@/lib/contact';

// Newsletter delivery is not yet wired up to a backend (no mailing-list
// integration). Until it is, do not collect emails into a dead form that
// pretends to succeed — point people to WhatsApp / email so the contact is
// actually received.
export default function NewsletterForm() {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 'var(--sp-6)',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-mid)',
        borderRadius: 'var(--r-xl)',
        color: 'var(--text-secondary)',
      }}
    >
      <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        Newsletter coming soon.
      </p>
      <p style={{ fontSize: '0.85rem', marginBottom: 'var(--sp-3)' }}>
        Until then, follow Srilatha for new drops and offers:
      </p>
      <div style={{ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'center', flexWrap: 'wrap' }}>
        <a
          href={waLink('Hi! Please add me to your updates list — I\'d love to hear about new pieces.')}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-whatsapp"
        >
          WhatsApp
        </a>
        <a href={`mailto:${CONTACT.email}?subject=Add%20me%20to%20updates`} className="btn btn-secondary">
          Email
        </a>
      </div>
    </div>
  );
}
