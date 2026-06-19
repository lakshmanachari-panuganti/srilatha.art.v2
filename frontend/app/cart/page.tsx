'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/components/cart/CartProvider';
import { formatPrice } from '@/lib/data';
import PageHeader from '@/components/ui/PageHeader';

export default function CartPage() {
  const { items, itemCount, subtotal, updateQty, removeItem } = useCart();

  const shipping = subtotal >= 99900 ? 0 : (items.length > 0 ? 9900 : 0);
  const total = subtotal + shipping;

  if (items.length === 0) {
    return (
      <div className="page-shell">
        <div className="container">
          <PageHeader eyebrow="Your Cart" title="Cart is empty" description="Nothing here yet — start with something you love." currentLabel="Cart" />
          <div style={{ textAlign: 'center', padding: 'var(--sp-16) 0' }}>
            <div style={{ fontSize: '4rem', marginBottom: 'var(--sp-4)' }}>🛒</div>
            <Link href="/shop" className="btn btn-primary btn-lg pulse-glow">Browse Artworks →</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="container">
        <PageHeader eyebrow="Your Cart" title={<>{itemCount} {itemCount === 1 ? 'piece' : 'pieces'}</>} currentLabel="Cart" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--sp-8)' }} className="cart-grid">
          {/* Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            {items.map(item => (
              <div key={`${item.product.id}-${item.variant}`} className="card" style={{ padding: 'var(--sp-4)', display: 'grid', gridTemplateColumns: '88px 1fr auto', gap: 'var(--sp-4)', alignItems: 'center' }}>
                <Link href={`/product/${item.product.slug}`} style={{ position: 'relative', width: 88, height: 88, borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                  <Image src={item.product.images[0]} alt={item.product.name} fill sizes="88px" style={{ objectFit: 'cover' }} />
                </Link>
                <div style={{ minWidth: 0 }}>
                  <Link href={`/product/${item.product.slug}`} style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem', display: 'block', marginBottom: 4 }}>
                    {item.product.name}
                  </Link>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--sp-2)' }}>{formatPrice(item.product.price)} each</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                    <button onClick={() => updateQty(item.product.id, item.qty - 1, item.variant)} aria-label="Decrease quantity" style={{ width: 32, height: 32, borderRadius: 'var(--r-sm)', border: '1px solid var(--border-mid)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer' }}>−</button>
                    <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>{item.qty}</span>
                    <button onClick={() => updateQty(item.product.id, item.qty + 1, item.variant)} aria-label="Increase quantity" style={{ width: 32, height: 32, borderRadius: 'var(--r-sm)', border: '1px solid var(--border-mid)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer' }}>+</button>
                    <button onClick={() => removeItem(item.product.id, item.variant)} style={{ marginLeft: 'var(--sp-2)', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}>Remove</button>
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{formatPrice(item.product.price * item.qty)}</div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div>
            <div className="card" style={{ padding: 'var(--sp-6)', position: 'sticky', top: 90 }}>
              <h2 style={{ fontWeight: 800, color: 'var(--text-primary)', marginBottom: 'var(--sp-5)', fontSize: '1rem' }}>Order Summary</h2>

              {shipping > 0 && (
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Add {formatPrice(99900 - subtotal)} more for FREE shipping</p>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 9999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min((subtotal / 99900) * 100, 100)}%`, background: 'var(--gradient-brand)', borderRadius: 9999 }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <span>Subtotal</span><span>{formatPrice(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: shipping === 0 ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                  <span>Shipping</span><span>{shipping === 0 ? '🎉 FREE' : formatPrice(shipping)}</span>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 'var(--sp-2)', paddingTop: 'var(--sp-3)', display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1.1rem' }}>
                  <span style={{ color: 'var(--text-primary)' }}>Total</span>
                  <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{formatPrice(total)}</span>
                </div>
              </div>

              <Link href="/checkout" className="btn btn-primary btn-full btn-lg pulse-glow" style={{ marginTop: 'var(--sp-5)' }}>Checkout →</Link>
              <Link href="/shop" className="btn btn-secondary btn-full" style={{ marginTop: 'var(--sp-2)' }}>Continue Shopping</Link>

              <div style={{ marginTop: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                {['🔒 SSL Encrypted Checkout', '📦 Ships in 5–7 days', '🔄 7-Day Free Returns'].map(t => (
                  <div key={t} style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 1024px) { .cart-grid { grid-template-columns: 1.5fr 1fr !important; } }
      `}</style>
    </div>
  );
}
