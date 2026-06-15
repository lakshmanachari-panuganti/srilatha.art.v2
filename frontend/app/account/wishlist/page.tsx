'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AccountShell from '@/components/auth/AccountShell';
import { PRODUCTS, Product } from '@/lib/data';
import ProductCard from '@/components/shop/ProductCard';

export default function WishlistPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem('srilatha_wishlist') ?? '[]');
      setProducts(PRODUCTS.filter(p => ids.includes(p.id)));
    } catch {
      setProducts([]);
    } finally {
      setHydrated(true);
    }
  }, []);

  return (
    <AccountShell currentLabel="Wishlist">
      <div className="account-content-inner">
        <div className="account-section-header">
          <h2 className="account-section-title">My Wishlist</h2>
          {hydrated && products.length > 0 && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{products.length} saved</span>
          )}
        </div>

        {!hydrated ? (
          <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
        ) : products.length === 0 ? (
          <div className="account-placeholder">
            <div className="account-placeholder-icon">♥</div>
            <h3 className="account-placeholder-title">Your wishlist is empty</h3>
            <p className="account-placeholder-desc">Tap the heart on any piece you love to save it here.</p>
            <Link href="/shop" className="btn btn-primary btn-sm" style={{ marginTop: 16 }}>Browse the Shop</Link>
          </div>
        ) : (
          <div className="product-grid">
            {products.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </AccountShell>
  );
}
