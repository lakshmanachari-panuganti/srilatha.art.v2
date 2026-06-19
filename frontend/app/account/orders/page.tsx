'use client';
import Link from 'next/link';
import AccountShell from '@/components/auth/AccountShell';

export default function OrdersPage() {
  // Real orders will come from /api/users/me/orders once Phase 5/7 wires it.
  const orders: Array<{ id: string; number: string; date: string; total: number; status: string; itemsCount: number }> = [];

  return (
    <AccountShell currentLabel="Orders">
      <div className="account-content-inner">
        <div className="account-section-header">
          <h2 className="account-section-title">My Orders</h2>
        </div>

        {orders.length === 0 ? (
          <div className="account-placeholder">
            <div className="account-placeholder-icon">📦</div>
            <h3 className="account-placeholder-title">No orders yet</h3>
            <p className="account-placeholder-desc">When you place an order, you&apos;ll see it here with live status and tracking.</p>
            <Link href="/shop" className="btn btn-primary btn-sm" style={{ marginTop: 16 }}>Browse the Shop</Link>
          </div>
        ) : (
          <div className="account-orders-list">
            {orders.map(o => (
              <div key={o.id} className="account-order-row">
                <div className="account-order-meta">
                  <span className="account-order-number">{o.number}</span>
                  <span className="account-order-date">{o.date}</span>
                </div>
                <div className="account-order-items">{o.itemsCount} items</div>
                <div className="account-order-total">₹{(o.total / 100).toFixed(0)}</div>
                <span className="badge">{o.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AccountShell>
  );
}
