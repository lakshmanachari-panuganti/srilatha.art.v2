'use client';
import { useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import { waLink } from '@/lib/contact';

const FAQ_SECTIONS = [
  {
    title: 'Orders & Shipping',
    items: [
      { q: 'How long does it take to ship?', a: 'Most in-stock pieces dispatch within 3 business days. Delivery anywhere in India takes 5–7 business days with insured courier.' },
      { q: 'Do you ship internationally?', a: 'Not yet — we ship pan-India only. For a one-off international request, reach out on WhatsApp and we can quote it case by case.' },
      { q: 'Is shipping free?', a: 'Free standard shipping on orders above ₹999. Below that, shipping is ₹99 flat to any pincode.' },
      { q: 'How will my piece be packed?', a: 'Multiple layers of bubble wrap, corner protectors and a sturdy outer box. Larger pieces ship in custom wooden frames.' },
    ],
  },
  {
    title: 'Returns & Damage',
    items: [
      { q: 'Can I return a piece I don\'t love?', a: '7-day no-questions return on in-stock pieces. The piece must be in original packaging and undamaged. Custom-commissioned pieces are not returnable.' },
      { q: 'What if my piece arrives damaged?', a: 'Photograph the damaged piece and the box within 48 hours and send it on WhatsApp. We refund or remake at no cost.' },
      { q: 'Who pays return shipping?', a: 'We arrange and pay for the return pickup for damaged items. For change-of-mind returns, return shipping is your responsibility.' },
    ],
  },
  {
    title: 'Custom Orders',
    items: [
      { q: 'How do I commission a custom piece?', a: 'Fill the custom-order form and Srilatha will reply within 24 hours via WhatsApp to discuss your brief.' },
      { q: 'What\'s the minimum custom order value?', a: 'Custom orders start at ₹2,000. Final price depends on size, complexity and materials.' },
      { q: 'How long does a custom piece take?', a: 'Typically 4–6 weeks from design approval and 50% advance payment. Rush requests of 2–3 weeks are sometimes possible for a small surcharge.' },
      { q: 'How many revisions are included?', a: 'Two free revisions — one at the sketch stage, one before final sealing. Additional revisions are quoted separately.' },
    ],
  },
  {
    title: 'Care & Quality',
    items: [
      { q: 'Are the materials safe?', a: 'Yes. We use food-grade epoxy resin and certified non-toxic pigments. Coasters and trays use a food-safe topcoat.' },
      { q: 'How do I care for my piece?', a: 'See our full care guide — broadly: avoid direct sunlight, dust with a soft dry cloth, keep away from harsh chemicals.' },
      { q: 'Why does my piece look slightly different from the photos?', a: 'Resin is liquid art — every pour is unique. Colour intensity, flow pattern and gold-leaf distribution will vary slightly. That\'s the point of handmade.' },
    ],
  },
  {
    title: 'Payments',
    items: [
      { q: 'How do I pay?', a: 'Through Razorpay — UPI, all major cards, net banking and wallets. Custom orders take 50% advance via the same gateway.' },
      { q: 'Do you offer EMI?', a: 'EMI is available on credit cards for orders above ₹5,000, via Razorpay.' },
      { q: 'Is my payment secure?', a: 'Yes. Razorpay is PCI-DSS compliant and we never store your card details.' },
    ],
  },
];

export default function FaqPage() {
  const [open, setOpen] = useState<string | null>(`${FAQ_SECTIONS[0].title}-0`);

  return (
    <div className="page-shell">
      <div className="container">
        <PageHeader eyebrow="Help Centre" title={<>Frequently <em style={{ fontStyle: 'normal', background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Asked</em></>} description="Quick answers about orders, shipping, custom commissions and care. If you don't find what you need, message Srilatha on WhatsApp." currentLabel="FAQ" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-10)', maxWidth: 820 }}>
          {FAQ_SECTIONS.map(section => (
            <div key={section.title}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 'var(--sp-4)', letterSpacing: '-0.01em' }}>
                {section.title}
              </h2>
              <div className="card" style={{ padding: '0 var(--sp-6)' }}>
                {section.items.map((item, i) => {
                  const id = `${section.title}-${i}`;
                  const isOpen = open === id;
                  return (
                    <div key={id} className="faq-item">
                      <button
                        type="button"
                        className="faq-question"
                        onClick={() => setOpen(isOpen ? null : id)}
                        aria-expanded={isOpen}
                      >
                        <span>{item.q}</span>
                        <span className="faq-chevron" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                      </button>
                      {isOpen && <div className="faq-answer">{item.a}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'var(--sp-16)', textAlign: 'center', padding: 'var(--sp-10)', background: 'var(--bg-surface)', borderRadius: 'var(--r-2xl)', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 'var(--sp-2)' }}>Still have a question?</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--sp-5)', fontSize: '0.9rem' }}>Message Srilatha directly — replies within 24 hours.</p>
          <a href={waLink('Hi Srilatha! I have a question.')} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp btn-lg">Chat on WhatsApp</a>
          <Link href="/contact" className="btn btn-secondary btn-lg" style={{ marginLeft: 'var(--sp-3)' }}>Other ways to reach us</Link>
        </div>
      </div>
    </div>
  );
}
