'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Product, formatPrice } from '@/lib/data';
import { useCart } from '@/components/cart/CartProvider';

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="stars" aria-label={`${rating} out of 5 stars`}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= rating ? 'var(--accent-gold)' : 'var(--text-dim)', fontSize: '0.8rem' }}>★</span>
      ))}
    </span>
  );
}

interface ProductCardProps {
  product: Product;
  showQuickAdd?: boolean;
}

export default function ProductCard({ product, showQuickAdd = true }: ProductCardProps) {
  const { addItem, openCart } = useCart();
  const [wishlisted, setWishlisted] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const list = JSON.parse(localStorage.getItem('srilatha_wishlist') || '[]');
      return list.includes(product.id);
    } catch { return false; }
  });

  const discount = product.originalPrice
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : 0;

  const toggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const list: string[] = JSON.parse(localStorage.getItem('srilatha_wishlist') || '[]');
      const next = wishlisted ? list.filter(id => id !== product.id) : [...list, product.id];
      localStorage.setItem('srilatha_wishlist', JSON.stringify(next));
      setWishlisted(!wishlisted);
    } catch {}
  };

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!product.inStock) return;
    addItem(product, 1);
    openCart();
  };

  return (
    <article className="product-card">
      <div className="product-card-img">
        <Link href={`/product/${product.slug}`} tabIndex={-1} aria-hidden="true">
          <Image
            src={product.images[0] || '/images/resin-art-hero.png'}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            style={{ objectFit: 'cover' }}
          />
        </Link>

        {/* Badges */}
        <div className="product-card-badges">
          {product.isBestSeller && <span className="badge badge-gold">⭐ Best Seller</span>}
          {product.isNewArrival && <span className="badge badge-green">✦ New</span>}
          {discount > 0 && <span className="badge badge-red">−{discount}%</span>}
        </div>

        {/* Wishlist */}
        <button
          className={`product-card-wishlist ${wishlisted ? 'active' : ''}`}
          onClick={toggleWishlist}
          aria-pressed={wishlisted}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={wishlisted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>

        {/* Out of stock overlay */}
        {!product.inStock && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(9,11,16,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="badge badge-gray" style={{ fontSize: '0.72rem', padding: '6px 12px' }}>Sold Out</span>
          </div>
        )}

        {/* Quick add */}
        {showQuickAdd && product.inStock && (
          <button className="product-card-quick-add" onClick={handleQuickAdd} aria-label={`Quick add ${product.name} to cart`}>
            + Add to Cart
          </button>
        )}
      </div>

      <div className="product-card-body">
        <div className="product-card-category">{product.category}</div>
        <Link href={`/product/${product.slug}`} className="product-card-name">
          {product.name}
        </Link>
        <div className="product-card-rating">
          <StarRating rating={product.rating} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>({product.reviewCount})</span>
        </div>
        <div className="product-card-price">
          <span className="price-current">{formatPrice(product.price)}</span>
          {product.originalPrice && (
            <span className="price-original">{formatPrice(product.originalPrice)}</span>
          )}
          {discount > 0 && (
            <span className="price-discount">−{discount}%</span>
          )}
        </div>
      </div>
    </article>
  );
}
