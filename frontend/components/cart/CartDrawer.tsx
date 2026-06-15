'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/components/cart/CartProvider';
import { formatPrice } from '@/lib/data';

export default function CartDrawer() {
  const { isOpen, closeCart, items, removeItem, updateQty, itemCount } = useCart();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeCart(); };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeCart]);

  const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);
  const shippingThreshold = 99900; // ₹999 in paise
  const shipping = subtotal >= shippingThreshold ? 0 : 9900; // ₹99
  const total = subtotal + shipping;
  const progressPct = Math.min((subtotal / shippingThreshold) * 100, 100);

  return (
    <>
      {/* Overlay */}
      <div
        className={`cart-drawer-overlay ${isOpen ? 'open' : ''}`}
        onClick={closeCart}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`cart-drawer ${isOpen ? 'open' : ''}`}
        role="dialog"
        aria-label="Shopping cart"
        aria-modal="true"
      >
        {/* Header */}
        <div className="cart-drawer-header">
          <div className="cart-drawer-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 01-8 0"/>
            </svg>
            Your Cart
            {itemCount > 0 && <span className="cart-drawer-count">{itemCount}</span>}
          </div>
          <button onClick={closeCart} aria-label="Close cart" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, padding: 4, transition: 'color 0.15s' }}>
            ×
          </button>
        </div>

        {/* Shipping Progress */}
        {items.length > 0 && (
          <div className="cart-shipping-progress">
            {shipping > 0 ? (
              <>
                <p className="cart-shipping-note">
                  Add <strong style={{ color: 'var(--accent-green)' }}>{formatPrice(shippingThreshold - subtotal)}</strong> more for free shipping! 🚀
                </p>
                <div className="cart-shipping-bar">
                  <div className="cart-shipping-fill" style={{ width: `${progressPct}%` }} />
                </div>
              </>
            ) : (
              <p className="cart-shipping-free">🎉 You&apos;ve unlocked FREE shipping!</p>
            )}
          </div>
        )}

        {/* Body */}
        <div className="cart-drawer-body">
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--sp-12) var(--sp-6)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-4)' }}>
              <div style={{ width: 72, height: 72, borderRadius: 'var(--r-full)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <path d="M16 10a4 4 0 01-8 0"/>
                </svg>
              </div>
              <div>
                <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Your cart is empty</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Discover handcrafted pieces made just for you</p>
              </div>
              <Link href="/shop" onClick={closeCart} className="btn btn-primary">
                Start Shopping →
              </Link>
            </div>
          ) : (
            items.map((item) => (
              <div key={`${item.product.id}-${item.variant}`} className="cart-item">
                <div className="cart-item-img">
                  <Image
                    src={item.product.images[0] || '/images/resin-art-hero.png'}
                    alt={item.product.name}
                    width={72} height={72}
                    style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                  />
                </div>
                <div className="cart-item-info" style={{ flex: 1, minWidth: 0 }}>
                  <p className="cart-item-name">{item.product.name}</p>
                  {item.variant && <p className="cart-item-variant">{item.variant}</p>}
                  <div className="cart-item-bottom">
                    <div className="cart-qty-control">
                      <button
                        className="cart-qty-btn"
                        onClick={() => item.qty > 1 ? updateQty(item.product.id, item.qty - 1, item.variant) : removeItem(item.product.id, item.variant)}
                        aria-label="Decrease quantity"
                      >−</button>
                      <span className="cart-qty-num">{item.qty}</span>
                      <button
                        className="cart-qty-btn"
                        onClick={() => updateQty(item.product.id, item.qty + 1, item.variant)}
                        aria-label="Increase quantity"
                      >+</button>
                    </div>
                    <span className="cart-item-price">{formatPrice(item.product.price * item.qty)}</span>
                  </div>
                </div>
                <button
                  onClick={() => removeItem(item.product.id, item.variant)}
                  aria-label={`Remove ${item.product.name}`}
                  style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, alignSelf: 'flex-start', transition: 'color 0.15s' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="cart-drawer-footer">
            <div className="cart-totals">
              <div className="cart-total-row">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="cart-total-row">
                <span>Shipping</span>
                <span style={{ color: shipping === 0 ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                  {shipping === 0 ? '🎉 FREE' : formatPrice(shipping)}
                </span>
              </div>
              <div className="cart-total-row total">
                <span>Total</span>
                <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  {formatPrice(total)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <Link href="/checkout" onClick={closeCart} className="btn btn-primary btn-full btn-lg pulse-glow">
                ⚡ Proceed to Checkout
              </Link>
              <button onClick={closeCart} className="btn btn-secondary btn-full">
                Continue Shopping
              </button>
            </div>

            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 'var(--sp-3)' }}>
              🔒 Secure checkout via Razorpay · Free returns within 7 days
            </p>
          </div>
        )}
      </div>
    </>
  );
}
