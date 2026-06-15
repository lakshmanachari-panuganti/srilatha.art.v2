import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProductBySlug, PRODUCTS, REVIEWS, formatPrice } from '@/lib/data';
import ProductCard from '@/components/shop/ProductCard';
import ProductActions, { ImageGallery, ProductTabs } from './ProductActions';
import { Brush, Box, CheckCircle2, Lock } from 'lucide-react';

export async function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return { title: 'Product Not Found' };
  return {
    title: product.name,
    description: product.shortDesc,
    openGraph: { title: `${product.name} | Srilatha Art`, description: product.shortDesc, images: [{ url: product.images[0] }] },
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  resin: 'Resin Art', lippan: 'Lippan Art', mandala: 'Dot Mandala',
  kolam: 'Kolam Art', wedding: 'Wedding Decor', gifts: 'Gift Sets',
};

function StarRating({ rating, size = '1rem' }: { rating: number; size?: string }) {
  return (
    <span style={{ fontSize: size, color: 'var(--accent-gold)' }} aria-label={`${rating} out of 5`}>
      {'★'.repeat(Math.floor(rating))}
      <span style={{ color: 'var(--text-dim)' }}>{'★'.repeat(5 - Math.floor(rating))}</span>
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const reviews = REVIEWS.filter((r) => r.productId === product.id);
  const avgRating = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : product.rating;

  const related = PRODUCTS.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4);
  const discountPct = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', paddingBottom: 'var(--sp-16)' }}>
      <div className="container" style={{ paddingTop: 'var(--sp-8)' }}>

        {/* Breadcrumb */}
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className="breadcrumb-sep">›</span>
          <Link href="/shop">Shop</Link>
          <span className="breadcrumb-sep">›</span>
          <Link href={`/shop?category=${product.category}`}>{CATEGORY_LABELS[product.category]}</Link>
          <span className="breadcrumb-sep">›</span>
          <span className="current">{product.name}</span>
        </nav>

        {/* Main 2-col grid */}
        <div className="product-detail-grid">
          {/* LEFT — Image Gallery */}
          <div>
            <ImageGallery images={product.images} productName={product.name} />
          </div>

          {/* RIGHT — Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
            <span className="badge badge-gold" style={{ alignSelf: 'flex-start' }}>
              {CATEGORY_LABELS[product.category]}
            </span>

            <h1 style={{
              fontFamily: 'var(--font-body)', fontSize: 'clamp(1.6rem,4vw,2.4rem)',
              fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.15,
            }}>
              {product.name}
            </h1>

            {/* Rating */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
              <StarRating rating={product.rating} />
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {product.rating.toFixed(1)}
              </span>
              <a href="#reviews" style={{ fontSize: '0.82rem', color: 'var(--accent-blue)' }}>
                {reviews.length > 0 ? reviews.length : product.reviewCount} reviews
              </a>
            </div>

            {/* Price */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 'clamp(1.6rem,4vw,2.2rem)', fontWeight: 900,
                background: 'var(--gradient-warm)', WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                {formatPrice(product.price)}
              </span>
              {product.originalPrice && (
                <span style={{ fontSize: '1.1rem', color: 'var(--text-dim)', textDecoration: 'line-through' }}>
                  {formatPrice(product.originalPrice)}
                </span>
              )}
              {discountPct && (
                <span className="badge badge-green">{discountPct}% off</span>
              )}
            </div>

            {/* Short desc */}
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.92rem' }}>
              {product.shortDesc}
            </p>

            {/* Stock */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              {product.inStock ? (
                <>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: product.stockCount < 5 ? '#F59E0B' : 'var(--accent-green)', flexShrink: 0, boxShadow: `0 0 6px ${product.stockCount < 5 ? '#F59E0B' : 'var(--accent-green)'}` }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: product.stockCount < 5 ? '#F59E0B' : 'var(--accent-green)' }}>
                    {product.stockCount < 5 ? `⚠ Only ${product.stockCount} left!` : `In Stock — ${product.stockCount} available`}
                  </span>
                </>
              ) : (
                <>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#EF4444' }}>Out of Stock</span>
                </>
              )}
            </div>

            {/* Shipping nudge */}
            {product.price >= 99900 ? (
              <div className="shipping-free-badge">🎉 This order qualifies for <strong>FREE shipping!</strong></div>
            ) : (
              <div className="shipping-nudge">
                🚚 Add <strong>{formatPrice(99900 - product.price)}</strong> more for free shipping
              </div>
            )}

            {/* Client: Add to Cart / Wishlist */}
            <ProductActions product={product} />

            {/* Trust grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
              {[
                { Icon: Brush,         title: 'Handmade',        sub: '100% handcrafted' },
                { Icon: Box,           title: 'Safe Packing',    sub: 'Bubble-wrapped' },
                { Icon: CheckCircle2,  title: 'Verified Reviews', sub: 'Real customers' },
                { Icon: Lock,          title: 'Secure Pay',      sub: 'Razorpay encrypted' },
              ].map(({ Icon, title, sub }) => (
                <div key={title} className="trust-mini-card">
                  <Icon size={20} strokeWidth={1.6} aria-hidden="true" style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <ProductTabs
              description={product.description}
              material={product.material}
              careInstructions={product.careInstructions}
              dimensions={product.dimensions}
            />
          </div>
        </div>

        {/* Reviews */}
        <section id="reviews" style={{ marginTop: 'var(--sp-16)', scrollMarginTop: '90px' }}>
          <div style={{ marginBottom: 'var(--sp-8)' }}>
            <span className="eyebrow">Customer Reviews</span>
            <h2 style={{ color: 'var(--text-primary)', fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 800, margin: 'var(--sp-2) 0' }}>
              What our customers say
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
              <span style={{ fontSize: '3rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>
                {avgRating.toFixed(1)}
              </span>
              <div>
                <StarRating rating={avgRating} size="1.2rem" />
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  {reviews.length > 0 ? reviews.length : product.reviewCount} verified reviews
                </p>
              </div>
            </div>
          </div>

          {reviews.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 'var(--sp-5)' }}>
              {reviews.map((review) => (
                <article key={review.id} className="testimonial-card">
                  <div className="testimonial-stars">{'★'.repeat(review.rating)}</div>
                  <p style={{ fontWeight: 700, color: 'var(--text-primary)', margin: 'var(--sp-2) 0' }}>{review.title}</p>
                  <p className="testimonial-text">&ldquo;{review.body}&rdquo;</p>
                  <div className="testimonial-author" style={{ marginTop: 'var(--sp-4)' }}>
                    <div className="testimonial-avatar">{review.author.charAt(0)}</div>
                    <div>
                      <div className="testimonial-name">{review.author}</div>
                      <div className="testimonial-city">{review.city} · {formatDate(review.date)}</div>
                    </div>
                    {review.verified && <span className="badge badge-green" style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>✓ Verified</span>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: 'var(--sp-10)' }}>
              <p style={{ fontSize: '2rem' }}>⭐</p>
              <p style={{ color: 'var(--text-muted)' }}>Be the first to review this piece!</p>
            </div>
          )}
        </section>

        {/* Related */}
        {related.length > 0 && (
          <section style={{ marginTop: 'var(--sp-16)' }}>
            <div className="section-header">
              <span className="eyebrow">You may also love</span>
              <h2>Related {CATEGORY_LABELS[product.category]} <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Pieces</span></h2>
            </div>
            <div className="product-grid">
              {related.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}
      </div>

      {/* Mobile sticky buy bar */}
      {product.inStock && (
        <div className="product-mobile-buy-bar">
          <div>
            <div style={{ fontWeight: 900, color: 'var(--text-primary)', fontSize: '1rem' }}>{formatPrice(product.price)}</div>
            {product.originalPrice && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>{formatPrice(product.originalPrice)}</div>
            )}
          </div>
          <a href="#product-actions" className="btn btn-primary pulse-glow" style={{ flexShrink: 0 }}>Add to Cart →</a>
        </div>
      )}

      <style>{`
        .product-detail-grid { display:grid; grid-template-columns:1fr; gap:var(--sp-10); margin-top:var(--sp-8); }
        @media(min-width:768px){ .product-detail-grid{ grid-template-columns:1fr 1fr; gap:var(--sp-14); } }
        .trust-mini-card { display:flex; align-items:center; gap:var(--sp-2); padding:var(--sp-3); background:var(--bg-card); border:1px solid var(--border); border-radius:var(--r-lg); }
        .shipping-free-badge { background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.2); border-radius:var(--r-lg); padding:var(--sp-3) var(--sp-4); font-size:0.82rem; color:var(--accent-green); }
        .shipping-nudge { background:var(--bg-elevated); border:1px solid var(--border-mid); border-radius:var(--r-lg); padding:var(--sp-3) var(--sp-4); font-size:0.82rem; color:var(--text-secondary); }
        .product-mobile-buy-bar { display:flex; position:fixed; bottom:0; left:0; right:0; z-index:49; background:rgba(9,11,16,0.96); backdrop-filter:blur(16px); border-top:1px solid var(--border-accent); padding:12px 16px 16px; align-items:center; justify-content:space-between; gap:12px; }
        @media(min-width:768px){ .product-mobile-buy-bar{ display:none; } }
      `}</style>
    </div>
  );
}
