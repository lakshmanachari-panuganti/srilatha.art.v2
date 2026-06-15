import type { Metadata } from 'next';
import Link from 'next/link';
import { getSaleProducts } from '@/lib/data';
import ProductCard from '@/components/shop/ProductCard';
import PageHeader from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Sale',
  description: 'Limited-time discounts on handmade resin art, lippan and gift sets.',
};

export default function SalePage() {
  const saleProducts = getSaleProducts();

  return (
    <div className="page-shell">
      <div className="container">
        <PageHeader eyebrow="Limited Time" title={<>On <em style={{ fontStyle: 'normal', background: 'var(--gradient-warm)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Sale</em></>} description="Handpicked pieces at limited-time prices. When they’re gone, they’re gone." currentLabel="Sale" />

        {saleProducts.length > 0 ? (
          <div className="product-grid">
            {saleProducts.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        ) : (
          <div className="card" style={{ padding: 'var(--sp-12)', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--sp-4)' }}>✨</div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--sp-2)' }}>No sale items right now</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--sp-5)', fontSize: '0.9rem' }}>Subscribe to the newsletter — sale drops are emailed first.</p>
            <Link href="/shop" className="btn btn-primary btn-lg">Browse Full Shop →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
