import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import Prose from '@/components/ui/Prose';
import { seedImg } from '@/lib/assets';

export const metadata: Metadata = {
  title: 'About Srilatha',
  description: 'The story of Srilatha Art — an enthusiastic artist working with resin, lippan, dot mandala and Indian folk art motifs. Each piece is handmade in our studio.',
};

const VALUES = [
  { title: 'Patience', body: 'Each resin pour cures for 24–72 hours. We never rush a piece — slow is the only way to make work that lasts.' },
  { title: 'Honesty', body: 'No prints, no mass production, no agency-managed marketing. You buy directly from the artist.' },
  { title: 'Craft', body: 'Every layer is poured, every dot placed, every mirror inlaid by hand. The maker\'s mark is in every imperfection.' },
];

export default function AboutPage() {
  return (
    <div className="page-shell">
      <div className="container">
        <PageHeader eyebrow="Our Story" title={<>Made by Hand, <em style={{ fontStyle: 'normal', background: 'var(--gradient-warm)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>by Srilatha</em></>} description="A small, slow studio making heirloom resin art and Indian folk art — one piece at a time." currentLabel="About" />

        <div style={{ position: 'relative', aspectRatio: '16/8', borderRadius: 'var(--r-2xl)', overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 'var(--sp-12)' }}>
          <Image src={seedImg('resin-art-hero.png')} alt="Srilatha Art studio" fill style={{ objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--bg-base) 0%, transparent 60%)' }} />
        </div>

        <Prose>
          <h2>How it started</h2>
          <p>
            Srilatha is an enthusiastic artist who discovered the magic of resin art in 2019. Captivated by how liquid resin captures light, colour and movement, she began experimenting in her home studio — combining modern resin techniques with the rich folk art motifs of India.
          </p>
          <p>
            What started as a creative outlet has grown into a small, growing handmade art business. Every piece sold from this studio is poured, painted and packed by Srilatha herself.
          </p>

          <h2>What we make</h2>
          <p>
            Six collections, all handmade: <strong>Resin Art</strong> (our primary), <strong>Lippan Art</strong>, <strong>Dot Mandala</strong>, <strong>Kolam Art</strong>, <strong>Wedding Decor</strong> and <strong>Gift Sets</strong>. The materials are food-grade resin, certified non-toxic pigments, 24k gold leaf, mica powder and natural clay — chosen so the work is safe in your home and lasts decades.
          </p>

          <h2>How we work</h2>
          <p>
            Most pieces are made to order. Resin curing alone takes 24–72 hours per layer, and a finished piece typically takes 4–7 days of studio time. You see progress photos at every stage. If you don&apos;t love it, we make it right.
          </p>

          <h2>What we believe</h2>
          <ul>
            {VALUES.map(v => (
              <li key={v.title}><strong>{v.title}.</strong> {v.body}</li>
            ))}
          </ul>

          <h2>Where to find us</h2>
          <p>
            The studio is in Chilkanagar, Uppal, Hyderabad. We ship pan-India. For custom commissions, talk to Srilatha directly via <Link href="/custom-order">the custom-order form</Link> or WhatsApp.
          </p>
        </Prose>

        <div style={{ marginTop: 'var(--sp-12)', display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <Link href="/shop" className="btn btn-primary btn-lg pulse-glow">Shop the Collection</Link>
          <Link href="/custom-order" className="btn btn-secondary btn-lg">Commission a Piece</Link>
        </div>
      </div>
    </div>
  );
}
