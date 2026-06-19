import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import Prose from '@/components/ui/Prose';
import { CONTACT } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern the use of srilatha.art and our products.',
};

export default function TermsPage() {
  return (
    <div className="page-shell">
      <div className="container">
        <PageHeader eyebrow="Legal" title="Terms of Service" description="Last updated: June 2026. The terms that govern buying from us and using this site." currentLabel="Terms" />

        <Prose>
          <h2>1. Acceptance</h2>
          <p>
            By using srilatha.art or placing an order with us you agree to these terms. If you do not agree, please do not use the site.
          </p>

          <h2>2. Products</h2>
          <ul>
            <li>Every piece is handmade. Slight variations in colour, pattern and finish are inherent and expected.</li>
            <li>Photographs are taken under studio lighting and your screen may render colours differently.</li>
            <li>Materials, dimensions and care instructions are listed on each product page.</li>
            <li>We may discontinue any product at any time.</li>
          </ul>

          <h2>3. Pricing</h2>
          <ul>
            <li>All prices are in Indian Rupees (₹) and inclusive of GST where applicable.</li>
            <li>Shipping is calculated at checkout — free above ₹999, otherwise ₹99.</li>
            <li>We reserve the right to correct pricing errors before the order ships and refund or cancel if you do not accept the correction.</li>
          </ul>

          <h2>4. Orders &amp; Payment</h2>
          <ul>
            <li>Orders are confirmed only after payment is received.</li>
            <li>Payment is processed by Razorpay (UPI, cards, net banking, wallets). We never store payment details.</li>
            <li>Custom orders require a 50% non-refundable advance — see <Link href="/policies/custom-orders">Custom Order Terms</Link>.</li>
          </ul>

          <h2>5. Shipping, Returns &amp; Damage</h2>
          <p>Governed entirely by our <Link href="/shipping-returns">Shipping &amp; Returns policy</Link>. In brief: pan-India only, 5–7 business days delivery, 7-day return window on in-stock pieces, custom pieces non-returnable.</p>

          <h2>6. Intellectual Property</h2>
          <p>
            All artwork, photographs, designs and written content on this site are the property of Srilatha Art. You may not reproduce, copy, resell or use any content for commercial purposes without written permission. Buying a piece does not transfer copyright — you own the physical object, we retain the artistic copyright.
          </p>

          <h2>7. User content</h2>
          <p>
            If you submit reviews, photos or messages to us, you grant Srilatha Art a non-exclusive, royalty-free licence to use that content in marketing materials with attribution to your first name and city.
          </p>

          <h2>8. Account responsibilities</h2>
          <ul>
            <li>You are responsible for the accuracy of your shipping address.</li>
            <li>Keep your login credentials secure.</li>
            <li>Notify us of any unauthorised use of your account.</li>
          </ul>

          <h2>9. Limitation of Liability</h2>
          <p>
            To the maximum extent allowed by law, our liability is limited to the amount you paid for the piece in question. We are not liable for indirect, incidental or consequential damages.
          </p>

          <h2>10. Governing law</h2>
          <p>
            These terms are governed by the laws of India. Any dispute will be subject to the exclusive jurisdiction of the courts of Hyderabad, Telangana.
          </p>

          <h2>11. Contact</h2>
          <p>
            Questions about these terms: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.
          </p>
        </Prose>
      </div>
    </div>
  );
}
