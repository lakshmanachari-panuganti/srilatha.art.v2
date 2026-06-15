import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import Prose from '@/components/ui/Prose';

export const metadata: Metadata = {
  title: 'Custom Order Terms',
  description: 'Terms for commissioning a bespoke piece — advance, timeline, revisions, cancellations.',
};

export default function CustomOrdersPolicyPage() {
  return (
    <div className="page-shell">
      <div className="container">
        <PageHeader eyebrow="Policies" title={<>Custom Order <em style={{ fontStyle: 'normal', background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Terms</em></>} description="What to expect when you commission a piece — pricing, timelines, revisions and the bits that protect both of us." crumbs={[{ href: '/custom-order', label: 'Custom Order' }]} currentLabel="Terms" />

        <Prose>
          <h2>1. Quote &amp; advance</h2>
          <ul>
            <li>After we discuss your brief, you&apos;ll receive a written quote covering materials, dimensions, timeline and final price.</li>
            <li>To start work we require a <strong>50% non-refundable advance</strong>. The balance is due before shipping.</li>
            <li>Minimum custom order value is <strong>₹2,000</strong>.</li>
          </ul>

          <h2>2. Timeline</h2>
          <ul>
            <li>Typical lead time is <strong>4–6 weeks</strong> from advance payment to dispatch.</li>
            <li>Rush requests (2–3 weeks) may be possible — quoted with a surcharge.</li>
            <li>Resin cure times are non-negotiable; we won&apos;t ship before a piece is fully cured.</li>
          </ul>

          <h2>3. Design &amp; revisions</h2>
          <ul>
            <li>You&apos;ll see a digital sketch or sample for approval before we start the physical piece.</li>
            <li><strong>Two free revisions are included</strong> — one at the sketch stage, one before final sealing.</li>
            <li>Additional revisions are quoted at ₹500 per revision depending on stage.</li>
            <li>Once you approve the final design, material changes cannot be reversed.</li>
          </ul>

          <h2>4. Progress updates</h2>
          <p>You&apos;ll receive WhatsApp photos at three stages: sketch, mid-pour and final piece before packing. Approve at each stage to keep us on track.</p>

          <h2>5. Returns &amp; refunds</h2>
          <ul>
            <li>Custom pieces are <strong>not returnable</strong> for change of mind — they are made specifically for you.</li>
            <li>If the finished piece <em>materially deviates</em> from the approved design, we will remake or refund — at our discretion after photo review.</li>
            <li>Damage in transit is covered — same terms as our <Link href="/shipping-returns">standard policy</Link>.</li>
          </ul>

          <h2>6. Cancellations</h2>
          <ul>
            <li>You can cancel before advance payment with no charge.</li>
            <li>After advance, the 50% becomes non-refundable since materials are sourced and reserved.</li>
            <li>If we are unable to complete a commission (rare), we refund 100% within 7 days.</li>
          </ul>

          <h2>7. Use of images</h2>
          <p>We retain the right to photograph and share images of completed commissions on our website and Instagram. Tell us in writing if you&apos;d prefer your piece to stay private — we&apos;ll respect that.</p>

          <h2>8. Anything else</h2>
          <p>
            All other terms in our <Link href="/terms">Terms of Service</Link> and <Link href="/privacy-policy">Privacy Policy</Link> apply.
          </p>
        </Prose>

        <div style={{ marginTop: 'var(--sp-12)' }}>
          <Link href="/custom-order" className="btn btn-primary btn-lg pulse-glow">Start a Commission →</Link>
        </div>
      </div>
    </div>
  );
}
