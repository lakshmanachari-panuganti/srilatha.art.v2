'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Product } from '@/lib/data';
import { listProducts } from '@/lib/api';
import ProductCard from '@/components/shop/ProductCard';
import PageHeader from '@/components/ui/PageHeader';

export default function SaleClient() {
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listProducts({ onSale: true, limit: 100 })
      .then(r => { if (!cancelled) setProducts(r.products); })
      .catch(() => { if (!cancelled) setProducts([]); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="page-shell">
      <div className="container">
        <PageHeader
          eyebrow="Limited Time"
          title={<>On <em style={{ fontStyle: 'normal', background: 'var(--gradient-warm)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Sale</em></>}
          description="Handpicked pieces at limited-time prices. When they’re gone, they’re gone."
          currentLabel="Sale"
        />

        {products === null ? (
          <div className="product-grid">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="card" style={{ aspectRatio: '1', background: 'var(--bg-elevated)' }} />
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="product-grid">
            {products.map(p => <ProductCard key={p.id} product={p} />)}
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
