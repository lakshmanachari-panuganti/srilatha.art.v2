import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PRODUCTS, formatPrice } from '@/lib/data';
import ProductCard from '@/components/shop/ProductCard';
import SortSelect from './SortSelect';

export const metadata: Metadata = {
  title: 'Shop Handmade Art — Resin, Lippan, Mandala, Kolam',
  description: 'Browse all handmade artworks by Srilatha. Resin Art, Lippan Art, Dot Mandala, Kolam Art, Wedding Decor & Gift Sets. Free shipping above ₹999.',
};

// Next.js 15: searchParams is a Promise
interface PageProps {
  searchParams: Promise<{ category?: string; sort?: string }>;
}

const CATEGORY_PILLS = [
  { id: 'all',     label: '🛍️ All' },
  { id: 'resin',   label: '🫗 Resin Art' },
  { id: 'lippan',  label: '🪡 Lippan Art' },
  { id: 'mandala', label: '⭕ Dot Mandala' },
  { id: 'kolam',   label: '🌸 Kolam Art' },
  { id: 'wedding', label: '💍 Wedding Decor' },
  { id: 'gifts',   label: '🎁 Gifts' },
];

export default async function ShopPage({ searchParams }: PageProps) {
  // Await params (Next.js 15 requirement)
  const { category, sort } = await searchParams;

  // Filter products
  let products = category && category !== 'all'
    ? PRODUCTS.filter(p =>
        p.category.toLowerCase().includes(category.toLowerCase())
      )
    : PRODUCTS;

  // Sort
  switch (sort) {
    case 'price-asc':  products = [...products].sort((a, b) => a.price - b.price); break;
    case 'price-desc': products = [...products].sort((a, b) => b.price - a.price); break;
    case 'newest':     products = [...products].filter(p => p.isNewArrival).concat([...products].filter(p => !p.isNewArrival)); break;
    case 'rating':     products = [...products].sort((a, b) => b.rating - a.rating); break;
  }

  const activeCategory = category || 'all';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', padding: 'var(--sp-8) 0 var(--sp-20)' }}>
      <div className="container">

        {/* Breadcrumb */}
        <nav className="breadcrumb">
          <Link href="/">Home</Link>
          <span className="breadcrumb-sep">›</span>
          <span className="current">Shop</span>
          {activeCategory !== 'all' && (
            <>
              <span className="breadcrumb-sep">›</span>
              <span className="current" style={{ textTransform: 'capitalize' }}>{activeCategory}</span>
            </>
          )}
        </nav>

        {/* Header */}
        <div style={{ marginBottom: 'var(--sp-8)' }}>
          <span className="eyebrow" style={{ marginBottom: 'var(--sp-3)' }}>Handmade with Love</span>
          <h1 style={{ color: 'var(--text-primary)', fontSize: 'clamp(1.8rem,5vw,3rem)', fontWeight: 900, marginBottom: 'var(--sp-2)' }}>
            {activeCategory === 'all' ? (
              <>Shop All <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Artworks</span></>
            ) : (
              <span style={{ textTransform: 'capitalize' }}>
                {activeCategory}{' '}
                <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Collection</span>
              </span>
            )}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Every piece is handmade to order · Ships in 5–7 days · Free returns within 7 days
          </p>
        </div>

        {/* Category Pills — horizontal scroll on mobile */}
        <div className="category-pills" role="navigation" aria-label="Filter by category">
          {CATEGORY_PILLS.map(cat => {
            const count = cat.id === 'all'
              ? PRODUCTS.length
              : PRODUCTS.filter(p => p.category.toLowerCase().includes(cat.id)).length;
            return (
              <Link
                key={cat.id}
                href={cat.id === 'all' ? '/shop' : `/shop?category=${cat.id}`}
                className={`category-pill${activeCategory === cat.id ? ' active' : ''}`}
                aria-current={activeCategory === cat.id ? 'page' : undefined}
              >
                {cat.label}
                <span style={{ fontSize: '0.68rem', opacity: 0.65, marginLeft: 4 }}>({count})</span>
              </Link>
            );
          })}
        </div>

        {/* Filter bar */}
        <div className="filter-bar">
          <span className="filter-result-count">
            {products.length} {products.length === 1 ? 'artwork' : 'artworks'} found
          </span>
          {/* SortSelect is a client component — wrap in Suspense */}
          <Suspense fallback={<select className="sort-select"><option>Featured</option></select>}>
            <SortSelect currentSort={sort || 'featured'} />
          </Suspense>
        </div>

        {/* Product Grid */}
        {products.length > 0 ? (
          <div className="product-grid">
            {products.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 'var(--sp-16)', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--sp-4)' }}>🎨</div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--sp-2)' }}>
              No artworks found
            </h2>
            <p style={{ marginBottom: 'var(--sp-6)', fontSize: '0.85rem' }}>
              Try a different category or browse all artworks.
            </p>
            <Link href="/shop" className="btn btn-primary">Browse All →</Link>
          </div>
        )}

        {/* Custom Order CTA */}
        <div style={{
          marginTop: 'var(--sp-16)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-mid)',
          borderRadius: 'var(--r-2xl)',
          padding: 'var(--sp-10)',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(0,163,255,0.05) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <span className="eyebrow" style={{ display: 'inline-flex', marginBottom: 'var(--sp-3)' }}>
            Custom Orders
          </span>
          <h2 style={{ fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 'var(--sp-3)', position: 'relative' }}>
            Can&apos;t find what you&apos;re looking for?
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: 480, margin: '0 auto var(--sp-6)', position: 'relative' }}>
            Commission a bespoke piece — your size, your colors, your vision.
          </p>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'center', flexWrap: 'wrap', position: 'relative' }}>
            <Link href="/custom-order" className="btn btn-primary btn-lg">
              Request Custom Order →
            </Link>
            <a href="https://wa.me/919876543210" target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp btn-lg">
              Chat on WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
