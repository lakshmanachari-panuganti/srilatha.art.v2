import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import Prose from '@/components/ui/Prose';

export const metadata: Metadata = {
  title: 'Shipping & Returns',
  description: 'Pan-India delivery in 5–7 days. 7-day returns. Insured shipping on every order.',
};

export default function ShippingReturnsPage() {
  return (
    <div className="page-shell">
      <div className="container">
        <PageHeader eyebrow="Policies" title={<>Shipping &amp; <em style={{ fontStyle: 'normal', background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Returns</em></>} description="How your art reaches you safely — and what happens if anything goes wrong." currentLabel="Shipping & Returns" />

        <Prose>
          <h2>Shipping</h2>
          <ul>
            <li><strong>Free shipping</strong> on all orders above ₹999.</li>
            <li>Flat <strong>₹99 shipping</strong> for orders below ₹999.</li>
            <li>We ship anywhere in India. International shipping is not currently available.</li>
            <li>Most in-stock pieces dispatch within 3 business days.</li>
            <li>Delivery typically takes <strong>5–7 business days</strong> after dispatch.</li>
            <li>Custom orders ship after they&apos;re finished — usually 4–6 weeks from design approval.</li>
          </ul>

          <h3>Packaging</h3>
          <p>
            Every piece is wrapped in multiple layers of bubble wrap, secured with corner protectors, and shipped in a sturdy outer box. Larger pieces ship in custom-built wooden frames. Shipping is insured for the full value.
          </p>

          <h3>Order tracking</h3>
          <p>
            You&apos;ll receive a WhatsApp message with the tracking link as soon as your order ships. You can also see live status in <Link href="/account/orders">your account → Orders</Link>.
          </p>

          <h2>Returns</h2>
          <ul>
            <li><strong>7-day no-questions return</strong> on in-stock pieces — change of mind, doesn&apos;t suit the room, anything.</li>
            <li>The piece must be in its <strong>original packaging</strong> and undamaged.</li>
            <li>Return shipping for change-of-mind returns is your responsibility.</li>
            <li>Refunds are issued via the original payment method within 5–7 business days of us receiving the returned piece.</li>
            <li><strong>Custom-commissioned pieces are not returnable</strong> — see <Link href="/policies/custom-orders">custom order terms</Link>.</li>
          </ul>

          <h2>Damage in transit</h2>
          <p>
            Open your parcel within 48 hours of delivery. If anything is damaged:
          </p>
          <ol>
            <li>Photograph the damaged piece <em>and</em> the outer box.</li>
            <li>Send the photos to us on WhatsApp within 48 hours.</li>
            <li>We&apos;ll arrange a free pickup and refund or remake the piece — your choice.</li>
          </ol>

          <h2>Cancellations</h2>
          <p>
            You can cancel an in-stock order anytime before it ships for a full refund. Custom orders can be cancelled before we start work — once materials are sourced, the 50% advance is non-refundable.
          </p>

          <h2>Questions?</h2>
          <p>
            Drop us a line via <Link href="/contact">Contact</Link> or message Srilatha on WhatsApp. We reply within 24 hours, Mon–Sat.
          </p>
        </Prose>
      </div>
    </div>
  );
}
