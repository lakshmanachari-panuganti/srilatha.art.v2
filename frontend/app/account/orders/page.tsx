'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AccountShell from '@/components/auth/AccountShell';
import { listMyOrders, ApiError, type MyOrderSummary } from '@/lib/api';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending payment',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<MyOrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('google_auth_token');
    if (!token) {
      // AccountShell will redirect to /login — render an empty state until then.
      setOrders([]);
      return;
    }
    listMyOrders(token)
      .then((res) => setOrders(res.orders))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load your orders.');
        setOrders([]);
      });
  }, []);

  const loading = orders === null && !error;

  return (
    <AccountShell currentLabel="Orders">
      <div className="account-content-inner">
        <div className="account-section-header">
          <h2 className="account-section-title">My Orders</h2>
        </div>

        {loading && (
          <div className="account-placeholder">
            <p className="account-placeholder-desc">Loading your orders…</p>
          </div>
        )}

        {!loading && error && (
          <div className="account-placeholder">
            <div className="account-placeholder-icon">⚠️</div>
            <h3 className="account-placeholder-title">Couldn&apos;t load orders</h3>
            <p className="account-placeholder-desc">{error}</p>
          </div>
        )}

        {!loading && !error && orders && orders.length === 0 && (
          <div className="account-placeholder">
            <div className="account-placeholder-icon">📦</div>
            <h3 className="account-placeholder-title">No orders yet</h3>
            <p className="account-placeholder-desc">When you place an order, you&apos;ll see it here with live status and tracking.</p>
            <Link href="/shop" className="btn btn-primary btn-sm" style={{ marginTop: 16 }}>Browse the Shop</Link>
          </div>
        )}

        {!loading && !error && orders && orders.length > 0 && (
          <div className="account-orders-list">
            {orders.map((o) => (
              <div key={o.orderId} className="account-order-row">
                <div className="account-order-meta">
                  <span className="account-order-number">{o.orderId}</span>
                  <span className="account-order-date">{formatDate(o.createdAt)}</span>
                </div>
                <div className="account-order-total">₹{(o.total / 100).toLocaleString('en-IN')}</div>
                <span className="badge">{STATUS_LABELS[o.status] ?? o.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AccountShell>
  );
}
