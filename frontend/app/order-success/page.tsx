'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { waLink, CONTACT } from '@/lib/contact';

function OrderSuccessInner() {
  const sp = useSearchParams();
  const orderId = sp.get('orderId') ?? '—';
  const paymentId = sp.get('paymentId') ?? '—';
  const emailSent = sp.get('emailSent') === '1';
  const emailTo = sp.get('emailTo');
  const emailError = sp.get('emailError');

  return (
    <div className="page-shell">
      <div className="container">
        <div className="card" style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--sp-10)', textAlign: 'center' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'rgba(0,230,118,0.15)',
            margin: '0 auto var(--sp-6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--glow-green)',
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="3" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1 style={{ fontFamily: 'var(--font-body)', fontSize: 'clamp(1.6rem,4vw,2.2rem)', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 'var(--sp-3)' }}>
            Order <em style={{ fontStyle: 'normal', background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Confirmed</em>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 'var(--sp-8)', lineHeight: 1.7 }}>
            Thank you! Your payment was successful and Srilatha will be in touch on WhatsApp with progress photos.
          </p>

          <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)', textAlign: 'left', marginBottom: 'var(--sp-8)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Order ID</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{orderId}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Payment ID</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{paymentId}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', textAlign: 'left', marginBottom: 'var(--sp-8)' }}>
            {emailSent && emailTo && (
              <div data-testid="email-sent" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>📧</span><span>Confirmation sent to <strong>{emailTo}</strong></span>
              </div>
            )}
            {[
              ['🧾', `Keep this Order ID safe — you'll need it to track your order`],
              ['📞', `Updates will come via WhatsApp from ${CONTACT.phoneDisplay}`],
              ['📦', `Dispatch within 3 business days`],
              ['🚚', `Delivery in 5–7 business days, pan-India`],
            ].map(([icon, text]) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>{icon}</span><span>{text}</span>
              </div>
            ))}
          </div>

          {!emailSent && (
            <div
              role="alert"
              data-testid="email-failed"
              style={{
                marginBottom: 'var(--sp-6)',
                padding: '12px 16px',
                borderRadius: 'var(--r-lg)',
                background: 'rgba(234,179,8,0.10)',
                border: '1px solid rgba(234,179,8,0.35)',
                color: '#854d0e',
                textAlign: 'left',
                fontSize: '0.85rem',
                lineHeight: 1.5,
              }}
            >
              <strong>Heads up:</strong> we couldn&rsquo;t send the confirmation email{emailTo ? <> to <strong>{emailTo}</strong></> : null}. Your payment is safe and your order is confirmed (keep the Order ID above). Please reply on WhatsApp to {CONTACT.phoneDisplay} and we&rsquo;ll send the confirmation manually.
              {emailError ? (
                <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#92400e' }}>
                  Reason: <code>{emailError}</code>
                </div>
              ) : null}
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link href="/account/orders" className="btn btn-primary">View My Orders</Link>
            <a href={waLink(`Hi! I just placed order ${orderId}.`)} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp">Message Srilatha</a>
            <Link href="/shop" className="btn btn-secondary">Continue Shopping</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<div className="page-shell"><div className="container" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div></div>}>
      <OrderSuccessInner />
    </Suspense>
  );
}
