'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCart } from '@/components/cart/CartProvider';
import { formatPrice } from '@/lib/data';
import { createOrder, validateCoupon, verifyPayment, ApiError } from '@/lib/api';

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Delhi','Jammu & Kashmir','Ladakh',
];

interface ShippingForm {
  fullName: string; email: string; phone: string;
  address1: string; address2: string; city: string;
  state: string; pincode: string; saveAddress: boolean;
}

const EMPTY_FORM: ShippingForm = {
  fullName: '', email: '', phone: '', address1: '', address2: '',
  city: '', state: '', pincode: '', saveAddress: false,
};

export default function CheckoutPage() {
  const router = useRouter();
  const { items, itemCount, subtotal, clearCart } = useCart();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<ShippingForm>(EMPTY_FORM);
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string>('');
  const [discount, setDiscount] = useState(0); // paise
  const [freeShippingCoupon, setFreeShippingCoupon] = useState(false);
  const [couponMsg, setCouponMsg] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [payError, setPayError] = useState('');

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  // Load saved address
  useEffect(() => {
    try {
      const saved = localStorage.getItem('srilatha_address');
      if (saved) setForm(JSON.parse(saved));
    } catch {}
  }, []);

  const baseShipping = subtotal >= 99900 ? 0 : 9900;
  const shipping = freeShippingCoupon ? 0 : baseShipping;
  const total = Math.max(0, subtotal - discount + shipping);

  const applyCoupon = async () => {
    const code = coupon.trim().toUpperCase();
    if (!code) return;
    setCouponBusy(true);
    setCouponMsg('');
    try {
      const result = await validateCoupon({ code, subtotal, shipping: baseShipping });
      if (result.valid) {
        setDiscount(result.discount ?? 0);
        setFreeShippingCoupon(!!result.freeShipping);
        setAppliedCoupon(result.code ?? code);
        setCouponMsg(`✓ ${result.description || 'Coupon applied'}`);
      } else {
        setDiscount(0);
        setFreeShippingCoupon(false);
        setAppliedCoupon('');
        setCouponMsg(`✗ ${result.message ?? 'Invalid coupon code.'}`);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not check coupon. Try again.';
      setDiscount(0);
      setFreeShippingCoupon(false);
      setAppliedCoupon('');
      setCouponMsg(`✗ ${msg}`);
    } finally {
      setCouponBusy(false);
    }
  };

  const validateForm = () => {
    const req = ['fullName', 'email', 'phone', 'address1', 'city', 'state', 'pincode'] as const;
    return req.every(f => form[f].trim().length > 0) && /^\d{6}$/.test(form.pincode);
  };

  const handleRazorpay = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setPayError('');

    if (form.saveAddress) {
      try { localStorage.setItem('srilatha_address', JSON.stringify(form)); } catch { /* ignore */ }
    }

    // 1. Server creates the Razorpay order with server-computed amount.
    let order;
    try {
      order = await createOrder({
        items: items.map(i => ({
          productId: i.product.id,
          name: i.product.name,
          qty: i.qty,
          price: i.product.price,
        })),
        customer: { name: form.fullName, email: form.email, phone: form.phone },
        address: { line1: form.address1, city: form.city, state: form.state, pincode: form.pincode },
        ...(appliedCoupon ? { couponCode: appliedCoupon } : {}),
      });
    } catch (err) {
      setIsProcessing(false);
      const msg = err instanceof ApiError ? err.message : 'Could not start payment. Please try again.';
      setPayError(msg);
      return;
    }

    // 2. Open Razorpay with the server-issued order id.
    type RzpResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
    const rzpOptions = {
      key: order.key,
      amount: order.amount,
      currency: order.currency,
      name: 'Srilatha Art',
      description: `Order ${order.orderId} — Handmade Art`,
      image: '/logo.png',
      order_id: order.razorpayOrderId,
      prefill: { name: form.fullName, email: form.email, contact: form.phone },
      notes: { address: form.address1, city: form.city, state: form.state },
      theme: { color: '#00A3FF' }, // matches --accent-blue brand primary
      handler: async (response: RzpResponse) => {
        // 3. Server verifies the HMAC signature before we trust the payment.
        try {
          await verifyPayment(order.orderId, {
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          clearCart();
          router.push(`/order-success?orderId=${encodeURIComponent(order.orderId)}&paymentId=${encodeURIComponent(response.razorpay_payment_id)}`);
        } catch (err) {
          const msg = err instanceof ApiError ? err.message : 'Payment received but verification failed. We are checking — please don\'t pay again.';
          setPayError(msg);
          setIsProcessing(false);
        }
      },
      modal: { ondismiss: () => setIsProcessing(false) },
    };

    try {
      const rzp = new (window as unknown as { Razorpay: new (opts: typeof rzpOptions) => { open: () => void } }).Razorpay(rzpOptions);
      rzp.open();
    } catch {
      setIsProcessing(false);
      setPayError('Payment gateway not available. Please try again.');
    }
  };

  if (itemCount === 0) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', gap: 'var(--sp-5)' }}>
        <div style={{ fontSize: '4rem' }}>🛒</div>
        <h1 style={{ color: 'var(--text-primary)', fontWeight: 800 }}>Nothing to checkout!</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Your cart is empty. Add some beautiful art first.</p>
        <Link href="/shop" className="btn btn-primary btn-lg">Go Shopping →</Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', paddingBottom: 'var(--sp-20)' }}>
      <div className="container" style={{ paddingTop: 'var(--sp-8)' }}>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-8)', justifyContent: 'center' }}>
          {(['Contact', 'Review', 'Payment'] as const).map((label, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 800,
                background: step > i + 1 ? 'var(--accent-green)' : step === i + 1 ? 'var(--accent-blue)' : 'var(--bg-elevated)',
                color: step >= i + 1 ? '#fff' : 'var(--text-muted)',
                boxShadow: step === i + 1 ? 'var(--glow-blue)' : 'none',
              }}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: step === i + 1 ? 'var(--accent-blue)' : 'var(--text-muted)' }}>
                {label}
              </span>
              {i < 2 && <span style={{ color: 'var(--text-dim)', margin: '0 4px' }}>›</span>}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--sp-8)' }} className="checkout-grid">

          {/* LEFT — Form */}
          <div>
            {/* Step 1: Shipping */}
            {step === 1 && (
              <div className="card" style={{ padding: 'var(--sp-8)' }}>
                <h2 style={{ color: 'var(--text-primary)', fontWeight: 800, marginBottom: 'var(--sp-6)', fontSize: '1.2rem' }}>
                  📦 Delivery Details
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }} className="form-grid-2">
                  {[
                    { name: 'fullName', label: 'Full Name *', type: 'text', placeholder: 'As on shipping label', col: 2 },
                    { name: 'email',   label: 'Email Address *', type: 'email', placeholder: 'For order confirmation' },
                    { name: 'phone',   label: 'WhatsApp / Phone *', type: 'tel', placeholder: '+91 9XXXXXXXXX' },
                  ].map(f => (
                    <div key={f.name} style={{ gridColumn: f.col === 2 ? '1/-1' : undefined }}>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--sp-1)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        {f.label}
                      </label>
                      <input
                        type={f.type}
                        placeholder={f.placeholder}
                        value={String((form as any)[f.name])}
                        onChange={e => setForm(prev => ({ ...prev, [f.name]: e.target.value }))}
                        className="form-input"
                        required
                      />
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--sp-4)', marginTop: 'var(--sp-4)' }}>
                  <div>
                    <label className="form-label">Address Line 1 *</label>
                    <input type="text" placeholder="Flat / House no, Street, Area" value={form.address1}
                      onChange={e => setForm(prev => ({ ...prev, address1: e.target.value }))} className="form-input" required />
                  </div>
                  <div>
                    <label className="form-label">Address Line 2 (optional)</label>
                    <input type="text" placeholder="Landmark, Colony" value={form.address2}
                      onChange={e => setForm(prev => ({ ...prev, address2: e.target.value }))} className="form-input" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-3)' }} className="form-grid-3">
                    <div>
                      <label className="form-label">City *</label>
                      <input type="text" placeholder="e.g. Mumbai" value={form.city}
                        onChange={e => setForm(prev => ({ ...prev, city: e.target.value }))} className="form-input" required />
                    </div>
                    <div>
                      <label className="form-label">State *</label>
                      <select value={form.state} onChange={e => setForm(prev => ({ ...prev, state: e.target.value }))} className="form-input" required>
                        <option value="">Select State</option>
                        {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Pincode *</label>
                      <input type="text" placeholder="6 digits" maxLength={6} value={form.pincode}
                        onChange={e => setForm(prev => ({ ...prev, pincode: e.target.value.replace(/\D/g, '') }))} className="form-input" required />
                    </div>
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginTop: 'var(--sp-5)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={form.saveAddress} onChange={e => setForm(prev => ({ ...prev, saveAddress: e.target.checked }))} style={{ accentColor: 'var(--accent-blue)', width: 16, height: 16 }} />
                  Save this address for next time
                </label>

                <button
                  onClick={() => { if (validateForm()) setStep(2); else alert('Please fill all required fields correctly.'); }}
                  className="btn btn-primary btn-full btn-lg pulse-glow"
                  style={{ marginTop: 'var(--sp-6)' }}
                >
                  Review Order →
                </button>
              </div>
            )}

            {/* Step 2: Review */}
            {step === 2 && (
              <div className="card" style={{ padding: 'var(--sp-8)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-6)' }}>
                  <h2 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '1.2rem' }}>📋 Review Order</h2>
                  <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '0.85rem' }}>
                    ← Edit Details
                  </button>
                </div>

                {/* Shipping address recap */}
                <div className="card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-6)', background: 'var(--bg-elevated)' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--sp-1)' }}>Delivering to</p>
                  <p style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{form.fullName}</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{form.address1}{form.address2 ? `, ${form.address2}` : ''}</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{form.city}, {form.state} — {form.pincode}</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{form.phone}</p>
                </div>

                {/* Coupon */}
                <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-2)' }}>
                  <input
                    type="text" placeholder="Coupon code" value={coupon}
                    onChange={e => { setCoupon(e.target.value); setCouponMsg(''); }}
                    className="form-input" style={{ flex: 1 }}
                  />
                  <button onClick={applyCoupon} disabled={couponBusy || !coupon.trim()} className="btn btn-secondary">
                    {couponBusy ? 'Checking…' : 'Apply'}
                  </button>
                </div>
                {couponMsg && (
                  <p style={{ fontSize: '0.82rem', color: couponMsg.startsWith('✓') ? 'var(--accent-green)' : '#EF4444', marginBottom: 'var(--sp-4)' }}>
                    {couponMsg}
                  </p>
                )}

                <button
                  onClick={() => setStep(3)}
                  className="btn btn-primary btn-full btn-lg pulse-glow"
                >
                  ⚡ Pay {formatPrice(total)} securely →
                </button>
              </div>
            )}

            {/* Step 3: Payment */}
            {step === 3 && (
              <div className="card" style={{ padding: 'var(--sp-8)', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: 'var(--sp-4)' }}>🔒</div>
                <h2 style={{ color: 'var(--text-primary)', fontWeight: 800, marginBottom: 'var(--sp-3)', fontSize: '1.2rem' }}>
                  Secure Payment
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--sp-6)', fontSize: '0.9rem' }}>
                  You&apos;ll be redirected to Razorpay to complete your payment safely.
                  Supports UPI, Cards, Net Banking & Wallets.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-6)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>🔒 256-bit SSL</span>
                  <span>·</span>
                  <span>Powered by Razorpay</span>
                  <span>·</span>
                  <span>PCI DSS Compliant</span>
                </div>
                <button
                  onClick={handleRazorpay}
                  disabled={isProcessing}
                  className="btn btn-primary btn-full btn-lg pulse-glow"
                  style={{ marginBottom: 'var(--sp-3)' }}
                >
                  {isProcessing ? '⏳ Opening Payment...' : `💳 Pay ${formatPrice(total)}`}
                </button>
                {payError && (
                  <p style={{ fontSize: '0.85rem', color: '#EF4444', marginBottom: 'var(--sp-3)' }}>{payError}</p>
                )}
                <button onClick={() => setStep(2)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>
                  ← Back to Review
                </button>
              </div>
            )}
          </div>

          {/* RIGHT — Order Summary */}
          <div className="checkout-summary">
            <div className="card" style={{ padding: 'var(--sp-6)', position: 'sticky', top: 90 }}>
              <h3 style={{ color: 'var(--text-primary)', fontWeight: 800, marginBottom: 'var(--sp-4)', fontSize: '1rem' }}>
                Order Summary ({itemCount} {itemCount === 1 ? 'item' : 'items'})
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
                {items.map(item => (
                  <div key={`${item.product.id}-${item.variant}`} style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
                    <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', overflow: 'hidden', flexShrink: 0, background: 'var(--bg-elevated)', position: 'relative' }}>
                      <Image src={item.product.images[0] || '/images/resin-art-hero.png'} alt={item.product.name} fill sizes="52px" style={{ objectFit: 'cover' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.product.name}
                      </p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Qty: {item.qty}</p>
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)', flexShrink: 0 }}>
                      {formatPrice(item.product.price * item.qty)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Shipping progress */}
              {shipping > 0 && (
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 'var(--sp-1)' }}>
                    Add {formatPrice(99900 - subtotal)} more for FREE shipping
                  </p>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 9999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min((subtotal / 99900) * 100, 100)}%`, background: 'var(--gradient-brand)', borderRadius: 9999, transition: 'width 0.4s' }} />
                  </div>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <span>Subtotal</span><span>{formatPrice(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--accent-green)' }}>
                    <span>Coupon ({appliedCoupon})</span><span>−{formatPrice(discount)}</span>
                  </div>
                )}
                {freeShippingCoupon && baseShipping > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--accent-green)' }}>
                    <span>Coupon ({appliedCoupon})</span><span>Free shipping</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: shipping === 0 ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                  <span>Shipping</span><span>{shipping === 0 ? '🎉 FREE' : formatPrice(shipping)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1.1rem', color: 'var(--text-primary)', paddingTop: 'var(--sp-2)', borderTop: '1px solid var(--border-mid)', marginTop: 'var(--sp-1)' }}>
                  <span>Total</span>
                  <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                    {formatPrice(total)}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                {['🔒 SSL Encrypted Checkout', '📦 Ships in 5–7 days', '🔄 7-Day Free Returns'].map(t => (
                  <div key={t} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .checkout-grid { grid-template-columns: 1fr; }
        @media(min-width: 1024px) { .checkout-grid { grid-template-columns: 1.4fr 1fr; } }
        .form-label { display:block; font-size:0.78rem; font-weight:600; color:var(--text-secondary); margin-bottom:var(--sp-1); text-transform:uppercase; letter-spacing:0.08em; }
        .form-input { width:100%; padding:12px 14px; border:1.5px solid var(--border-mid); border-radius:var(--r-lg); background:var(--bg-elevated); color:var(--text-primary); font-size:1rem; outline:none; transition:border-color 0.2s; box-sizing:border-box; font-family:inherit; }
        .form-input:focus { border-color:var(--accent-blue); box-shadow:0 0 0 3px rgba(0,163,255,0.1); }
        .form-input::placeholder { color:var(--text-dim); }
        .form-grid-2 { grid-template-columns:1fr 1fr; }
        .form-grid-3 { grid-template-columns:1fr 1fr 1fr; }
        @media(max-width:640px) { .form-grid-2,.form-grid-3 { grid-template-columns:1fr; } }
        .checkout-summary { display:none; }
        @media(min-width:1024px) { .checkout-summary { display:block; } }
      `}</style>
    </div>
  );
}
