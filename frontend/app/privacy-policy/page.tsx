import type { Metadata } from 'next';
import PageHeader from '@/components/ui/PageHeader';
import Prose from '@/components/ui/Prose';
import { CONTACT } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Srilatha Art collects, uses and protects your personal information.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="page-shell">
      <div className="container">
        <PageHeader eyebrow="Legal" title="Privacy Policy" description="Last updated: June 2026. We collect the minimum necessary to ship your order and stay in touch — nothing more." currentLabel="Privacy Policy" />

        <Prose>
          <h2>1. Who we are</h2>
          <p>
            &ldquo;Srilatha Art&rdquo; (we, us, our) operates the website srilatha.art and the related services. Our studio is at {CONTACT.studioAddress.line1}, {CONTACT.studioAddress.line2}, {CONTACT.studioAddress.city}, {CONTACT.studioAddress.country}. Contact: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.
          </p>

          <h2>2. What we collect</h2>
          <ul>
            <li><strong>Account &amp; contact:</strong> name, email, phone number, shipping address.</li>
            <li><strong>Order data:</strong> what you bought, when, the amount paid and order status.</li>
            <li><strong>Payment data:</strong> handled entirely by Razorpay. We never see your card or UPI details — we only receive a payment ID confirming the transaction.</li>
            <li><strong>Cookies &amp; local storage:</strong> cart contents, saved address, login state, wishlist.</li>
            <li><strong>Analytics:</strong> anonymous usage data (page views, device type) via Azure Application Insights.</li>
          </ul>

          <h2>3. How we use it</h2>
          <ul>
            <li>To process and ship your order.</li>
            <li>To send order updates via WhatsApp, email or SMS.</li>
            <li>To respond to your questions and provide support.</li>
            <li>To send newsletter updates <em>only if you opt in</em>.</li>
            <li>To prevent fraud and meet our legal obligations.</li>
          </ul>

          <h2>4. Who we share it with</h2>
          <ul>
            <li><strong>Razorpay</strong> — payment processing.</li>
            <li><strong>Couriers (Delhivery, BlueDart, India Post etc.)</strong> — shipping.</li>
            <li><strong>Meta / WhatsApp Cloud API</strong> — order update messages.</li>
            <li><strong>Microsoft Azure</strong> — hosting, storage and email infrastructure.</li>
          </ul>
          <p>We never sell your information to advertisers or data brokers.</p>

          <h2>5. How long we keep it</h2>
          <p>
            Order records are retained for 7 years to meet Indian accounting and tax obligations. Marketing preferences are retained until you unsubscribe. You can request deletion of any data we are not legally required to retain.
          </p>

          <h2>6. Your rights</h2>
          <p>You can request to:</p>
          <ul>
            <li>See what we hold about you.</li>
            <li>Correct anything inaccurate.</li>
            <li>Delete data we&apos;re not legally required to keep.</li>
            <li>Withdraw newsletter consent.</li>
          </ul>
          <p>Email <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> with &ldquo;Data request&rdquo; in the subject.</p>

          <h2>7. Security</h2>
          <p>
            Data is encrypted in transit (HTTPS/TLS 1.2+) and at rest (Azure Storage Service Encryption). Payments use Razorpay&apos;s PCI-DSS compliant gateway. Admin access is logged.
          </p>

          <h2>8. Children</h2>
          <p>The service is not directed to children under 18. We do not knowingly collect data from minors.</p>

          <h2>9. Changes</h2>
          <p>
            We&apos;ll update this page if our practices change and indicate the new &ldquo;Last updated&rdquo; date. Significant changes will be announced via email to active customers.
          </p>

          <h2>10. Contact</h2>
          <p>
            Privacy questions: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.
          </p>
        </Prose>
      </div>
    </div>
  );
}
