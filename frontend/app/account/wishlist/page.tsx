'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AccountShell from '@/components/auth/AccountShell';
import type { Product } from '@/lib/data';
import { listProducts } from '@/lib/api';
import ProductCard from '@/components/shop/ProductCard';

export default function WishlistPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let ids: string[] = [];
    try {
      ids = JSON.parse(localStorage.getItem('srilatha_wishlist') ?? '[]');
    } catch { ids = []; }

    if (ids.length === 0) {
      setProducts([]);
      setHydrated(true);
      return;
    }

    listProducts({ limit: 100 })
      .then(r => {
        if (cancelled) return;
        setProducts(r.products.filter(p => ids.includes(p.id)));
      })
      .catch(() => { if (!cancelled) setProducts([]); })
      .finally(() => { if (!cancelled) setHydrated(true); });

    return () => { cancelled = true; };
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
