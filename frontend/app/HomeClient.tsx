'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/lib/data';
import { listProducts } from '@/lib/api';
import ProductCard from '@/components/shop/ProductCard';
import NewsletterForm from '@/components/ui/NewsletterForm';
import { waLink } from '@/lib/contact';
import { seedImg } from '@/lib/assets';
import { Brush, Plane, Undo2, Award, Lightbulb, Beaker, Sparkles, Package } from 'lucide-react';

const COLLECTIONS = [
  { id: 'resin',   label: 'Resin Art',     img: seedImg('resin-art-hero.png'), primary: true },
  { id: 'lippan',  label: 'Lippan Art',    img: seedImg('lippan-art.png') },
  { id: 'mandala', label: 'Dot Mandala',   img: seedImg('dot-mandala.png') },
  { id: 'kolam',   label: 'Kolam Art',     img: seedImg('kolam-art.png') },
  { id: 'wedding', label: 'Wedding Decor', img: seedImg('wedding-decor.png') },
  { id: 'gifts',   label: 'Gift Sets',     img: seedImg('gift-items.png') },
];

const GALLERY_IMAGES = [
  seedImg('resin-art-hero.png'), seedImg('resin-geode.png'), seedImg('resin-ocean.png'),
  seedImg('lippan-art.png'),     seedImg('dot-mandala.png'),  seedImg('resin-coasters.png'),
];

const WHY_ITEMS = [
  { Icon: Brush, title: '100% Handmade', desc: 'Every piece is made to order by Srilatha herself — never mass-produced.' },
  { Icon: Plane, title: 'Pan-India Shipping', desc: 'Safe, insured delivery to every pincode in India in 5–7 days.' },
  { Icon: Undo2, title: 'Easy Returns', desc: '7-day hassle-free return policy. No questions asked.' },
  { Icon: Award, title: 'Premium Quality', desc: 'Only food-grade resins and certified non-toxic pigments.' },
];

const PROCESS_STEPS = [
  { num: '01', Icon: Lightbulb, tag: 'CONCEPT', title: 'Conceptualise', desc: 'Every piece starts with a vision. You share your idea, we sketch the design together.' },
  { num: '02', Icon: Beaker,    tag: 'CRAFT',   title: 'Pour & Layer', desc: 'Resin is poured in precise layers, each curing before the next — a 24–72 hr process.' },
  { num: '03', Icon: Sparkles,  tag: 'FINISH',  title: 'Detail & Finish', desc: 'Gold leaf, pigments, and hand-painted details are added. Then polished to perfection.' },
  { num: '04', Icon: Package,   tag: 'SHIP',    title: 'Pack & Deliver', desc: 'Carefully wrapped in multiple layers and shipped with insurance to your door.' },
];

const piecesLabel = (n: number) => `${n} ${n === 1 ? 'piece' : 'pieces'}`;

export default function HomeClient() {
  const [bestSellers, setBestSellers] = useState<Product[]>([]);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    listProducts({ limit: 100 }).then(r => {
      if (cancelled) return;
      setBestSellers(r.products.filter(p => p.isBestSeller));
      setNewArrivals(r.products.filter(p => p.isNewArrival));
      const tally: Record<string, number> = {};
      for (const p of r.products) {
        const c = String(p.category).toLowerCase();
        tally[c] = (tally[c] ?? 0) + 1;
      }
      setCounts(tally);
    }).catch(() => {
      // Best-effort: leave sections empty on failure
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {/* ─── HERO ──────────────────────────────────────────────── */}
      <section className="hero" id="top">
        <div className="hero-grid-bg" />
        <div className="hero-img-frame">
          <Image src={seedImg('resin-art-hero.png')} alt="Resin Art by Srilatha" fill priority style={{ objectFit: 'cover' }} />
        </div>

        <div className="container">
          <div className="hero-content">
            <div className="hero-img-frame-mobile">
              <Image src={seedImg('resin-art-hero.png')} alt="Resin Art by Srilatha" fill priority sizes="(max-width: 767px) 100vw, 0" style={{ objectFit: 'cover' }} />
            </div>
            {/* Hero intentionally renders no eyebrow chip — the headline and
                trust strip below carry the same "handmade · ships pan-India"
                signal more cleanly. */}
            <h1 className="hero-h1">
              <span className="hero-h1-line">Heirloom Resin Art</span>
              <span className="hero-h1-line">
                Made <em className="hero-h1-em">One&nbsp;Piece</em> at a Time
              </span>
            </h1>

            <p className="hero-desc">
              Poured by hand, layer by layer, in our studio.
              No two pieces are ever alike — yours will be one of a kind.
            </p>

            <div className="hero-actions">
              <Link href="/shop?category=resin" className="btn btn-primary btn-lg pulse-glow">
                ⚡ Explore Resin Art
              </Link>
              <Link href="/shop" className="btn btn-secondary btn-lg">
                View All Artworks
              </Link>
              <a
                href={waLink("Hi! I'm interested in your handmade art")}
                target="_blank" rel="noopener noreferrer"
                className="btn btn-whatsapp btn-lg"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Chat with Srilatha
              </a>
            </div>

            <div className="hero-trust">
              <div className="hero-trust-item"><span className="dot" />100% Handmade</div>
              <div className="hero-trust-item"><span className="dot" />Pan-India Delivery</div>
            </div>
          </div>
        </div>

        <div className="hero-scroll">
          <span>scroll</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
        </div>
      </section>

      {/* ─── COLLECTIONS ───────────────────────────────────────── */}
      <section className="section" style={{ background: 'var(--bg-surface)' }}>
        <div className="container">
          <div className="section-header">
            <span className="eyebrow">Our Collections</span>
            <h2>Art That Tells <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Stories</span></h2>
            <p>From flowing resin geodes to intricate lippan folk art — each collection is a world of its own.</p>
          </div>

          <div className="collections-grid">
            {COLLECTIONS.map((c) => (
              <Link
                key={c.id}
                href={`/shop?category=${c.id}`}
                className={`collection-card ${c.primary ? 'collection-card-primary' : 'collection-card-secondary'}`}
              >
                <Image src={c.img} alt={c.label} fill style={{ objectFit: 'cover' }} />
                <div className="collection-card-overlay">
                  {c.primary && (
                    <span className="badge badge-gold" style={{ marginBottom: 8, display: 'inline-flex', width: 'fit-content' }}>
                      ⭐ Primary Collection
                    </span>
                  )}
                  <h3>{c.label}</h3>
                  <p>{piecesLabel(counts[c.id] ?? 0)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── BEST SELLERS ──────────────────────────────────────── */}
      {bestSellers.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-header">
              <h2>Best Selling <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Artworks</span></h2>
              <p>These pieces fly off our shelves. Loved by customers across India.</p>
            </div>

            <div className="product-grid">
              {bestSellers.slice(0, 4).map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>

            <div style={{ textAlign: 'center', marginTop: 'var(--sp-6)' }}>
              <Link href="/shop" className="btn btn-secondary btn-lg">
                View All Products →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── WHY CHOOSE US ─────────────────────────────────────── */}
      <section className="section" style={{ background: 'var(--bg-surface)' }}>
        <div className="container">
          <div className="section-header">
            <span className="eyebrow">Why Srilatha Art</span>
            <h2>Crafted with <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Intention</span></h2>
            <p>We don&apos;t just sell art. We create pieces that carry emotion and meaning.</p>
          </div>

          <div className="why-grid">
            {WHY_ITEMS.map((item) => {
              const Icon = item.Icon;
              return (
                <div key={item.title} className="why-card">
                  <div className="why-icon" aria-hidden="true"><Icon size={28} strokeWidth={1.6} /></div>
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── PROCESS ───────────────────────────────────────────── */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow">Our Process</span>
            <h2>Made with <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Patience & Passion</span></h2>
            <p>Every piece goes through a meticulous 4-step process that can take up to 5 days.</p>
          </div>

          <div className="process-grid">
            {PROCESS_STEPS.map((step) => {
              const Icon = step.Icon;
              return (
                <div key={step.num} className="process-step">
                  <div className="process-step-tag">
                    <span className="badge badge-gray">{step.tag}</span>
                  </div>
                  <div className="process-step-num">STEP {step.num}</div>
                  <span className="process-step-icon" aria-hidden="true"><Icon size={28} strokeWidth={1.6} /></span>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── NEW ARRIVALS ──────────────────────────────────────── */}
      {newArrivals.length > 0 && (
        <section className="section" style={{ background: 'var(--bg-surface)' }}>
          <div className="container">
            <div className="section-header">
              <h2>New <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Arrivals</span></h2>
              <p>Fresh from the studio — limited pieces, first come first served.</p>
            </div>

            <div className="product-grid">
              {newArrivals.slice(0, 4).map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── ABOUT TEASER ──────────────────────────────────────── */}
      <section className="section" style={{ background: 'var(--bg-surface)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--sp-10)', alignItems: 'center' }}>
            <div style={{ position: 'relative', borderRadius: 'var(--r-2xl)', overflow: 'hidden', aspectRatio: '16/9', border: '1px solid var(--border)' }}>
              <Image src={seedImg('resin-art-hero.png')} alt="Srilatha at work" fill style={{ objectFit: 'cover', opacity: 0.8 }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--bg-surface) 0%, transparent 50%)' }} />
            </div>
            <div>
              <span className="eyebrow">Our Story</span>
              <h2 className="heading-lg" style={{ marginBottom: 'var(--sp-5)', color: 'var(--text-primary)' }}>
                Handcrafted<br />
                <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>with Care</span>
              </h2>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 'var(--sp-6)', fontSize: '0.95rem' }}>
                Srilatha is an enthusiastic artist who discovered the magic of resin art in 2019.
                Captivated by how liquid resin captures light, color, and movement, she began experimenting
                in her home studio — combining modern resin techniques with the rich folk art motifs of India.
                What started as a creative outlet has grown into a thriving handmade art business.
              </p>
              <Link href="/about" className="btn btn-primary">
                Meet Srilatha →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── INSTAGRAM GALLERY ─────────────────────────────────── */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <h2>Follow Our <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Journey</span></h2>
            <p>Behind the scenes, new pieces, process videos and more on <span style={{ color: 'var(--accent-blue)' }}>@srilatha.art</span>.</p>
          </div>

          <div className="ig-grid">
            {GALLERY_IMAGES.map((img, i) => (
              <a key={i} href="https://instagram.com/srilatha.art" target="_blank" rel="noopener noreferrer" className="ig-tile" aria-label={`Open Instagram gallery image ${i + 1}`}>
                <Image src={img} alt={`Gallery ${i + 1}`} fill style={{ objectFit: 'cover' }} />
                <span className="ig-tile-hover" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                  </svg>
                </span>
              </a>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 'var(--sp-8)' }}>
            <a
              href="https://instagram.com/srilatha.art"
              target="_blank" rel="noopener noreferrer"
              className="btn btn-secondary btn-lg"
              style={{ gap: 'var(--sp-2)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
              </svg>
              Follow on Instagram
            </a>
          </div>
        </div>
      </section>

      {/* ─── NEWSLETTER ────────────────────────────────────────── */}
      <div className="newsletter-section">
        <div className="container">
          <div style={{ maxWidth: 520, margin: '0 auto', position: 'relative', zIndex: 1 }}>
            <h2 className="heading-lg" style={{ color: 'var(--text-primary)', marginBottom: 'var(--sp-3)', textAlign: 'center' }}>
              Get Early Access to<br />
              <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>New Pieces</span>
            </h2>
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 'var(--sp-6)', fontSize: '0.9rem' }}>
              Be the first to know when new artworks drop. Subscribers get <strong style={{ color: 'var(--accent-gold)' }}>10% off</strong> their first order.
            </p>
            <NewsletterForm />
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 'var(--sp-3)' }}>
              No spam. Unsubscribe anytime.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .mobile-bottom-bar { display: none !important; }
          .mobile-bottom-spacer { display: none !important; }
        }
        @media (min-width: 1024px) {
          .hero-content { max-width: 600px; }
        }
      `}</style>
    </>
  );
}
