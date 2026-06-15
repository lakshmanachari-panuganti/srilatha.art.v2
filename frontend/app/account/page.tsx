"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/data";

/* ─── Types ───────────────────────────────────────────────────── */
interface StoredUser {
  name: string;
  email: string;
  phone?: string;
  joinedDate: string;
}

interface RecentOrder {
  id: string;
  number: string;
  date: string;
  total: number;
  status: "Delivered" | "Shipped" | "Crafting" | "Placed" | "Cancelled";
  itemsCount: number;
}

/* ─── Mock recent orders ──────────────────────────────────────── */
const RECENT_ORDERS: RecentOrder[] = [
  {
    id: "o001",
    number: "SRA-2025-0312",
    date: "2025-06-01",
    total: 489900,
    status: "Delivered",
    itemsCount: 1,
  },
  {
    id: "o002",
    number: "SRA-2025-0287",
    date: "2025-05-18",
    total: 379800,
    status: "Shipped",
    itemsCount: 2,
  },
  {
    id: "o003",
    number: "SRA-2025-0261",
    date: "2025-04-30",
    total: 149900,
    status: "Delivered",
    itemsCount: 1,
  },
];

/* ─── Status badge colours ────────────────────────────────────── */
const STATUS_CLASS: Record<string, string> = {
  Delivered: "badge badge-green",
  Shipped:   "badge badge-blue",
  Crafting:  "badge badge-gold",
  Placed:    "badge",
  Cancelled: "badge badge-red",
};

/* ─── Sidebar navigation items ───────────────────────────────── */
const NAV_ITEMS = [
  { key: "profile",   label: "Profile",    icon: "👤",  href: undefined },
  { key: "orders",    label: "Orders",     icon: "📦",  href: "/account/orders" },
  { key: "wishlist",  label: "Wishlist",   icon: "♥",   href: "/account/wishlist" },
  { key: "addresses", label: "Addresses",  icon: "📍",  href: undefined },
  { key: "invoices",  label: "Invoices",   icon: "🧾",  href: undefined },
];

/* ─── Helpers ─────────────────────────────────────────────────── */
function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ─── Sub-sections ────────────────────────────────────────────── */
function AddressesSection() {
  return (
    <div className="account-placeholder">
      <div className="account-placeholder-icon">📍</div>
      <h3 className="account-placeholder-title">No saved addresses</h3>
      <p className="account-placeholder-desc">
        Add a delivery address to speed up checkout.
      </p>
      <button className="btn btn-outline-gold btn-sm" style={{ marginTop: 16 }}>
        + Add Address
      </button>
    </div>
  );
}

function InvoicesSection() {
  return (
    <div className="account-placeholder">
      <div className="account-placeholder-icon">🧾</div>
      <h3 className="account-placeholder-title">No invoices yet</h3>
      <p className="account-placeholder-desc">
        Invoices for your orders will appear here once delivered.
      </p>
    </div>
  );
}

/* ─── Profile Section ─────────────────────────────────────────── */
function ProfileSection({ user }: { user: StoredUser }) {
  const [editing, setEditing] = useState(false);
  const [name, setName]   = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");

  const totalSpent = RECENT_ORDERS.reduce((s, o) => s + o.total, 0);

  const [wishlistCount, setWishlistCount] = useState(0);
  useEffect(() => {
    try {
      const wl = JSON.parse(localStorage.getItem("srilatha_wishlist") ?? "[]");
      setWishlistCount(Array.isArray(wl) ? wl.length : 0);
    } catch {
      setWishlistCount(0);
    }
  }, []);

  function handleSave() {
    const raw = localStorage.getItem("srilatha_user");
    if (raw) {
      const stored = JSON.parse(raw);
      stored.name  = name;
      stored.phone = phone;
      localStorage.setItem("srilatha_user", JSON.stringify(stored));
    }
    setEditing(false);
  }

  return (
    <div className="account-content-inner">
      {/* Avatar + name hero */}
      <div className="account-profile-hero">
        <div className="account-avatar">{getInitials(user.name)}</div>
        <div className="account-profile-info">
          <h2 className="account-profile-name">{user.name}</h2>
          <p className="account-profile-email">{user.email}</p>
          {user.phone && (
            <p className="account-profile-phone">{user.phone}</p>
          )}
          <p className="account-profile-joined">
            Member since {formatDate(user.joinedDate)}
          </p>
        </div>
        <button
          className="btn btn-outline-gold btn-sm account-edit-btn"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Cancel" : "✏ Edit Profile"}
        </button>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="account-edit-form">
          <h3 className="account-section-title">Edit Profile</h3>
          <div className="account-edit-grid">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                className="form-input"
                value={phone}
                placeholder="+91 9XXXXXXXXX"
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                className="form-input account-email-disabled"
                value={user.email}
                disabled
              />
            </div>
          </div>
          <div className="account-edit-actions">
            <button className="btn btn-primary btn-sm" onClick={handleSave}>
              Save Changes
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="account-stats-grid">
        <div className="account-stat-card">
          <div className="account-stat-value">{RECENT_ORDERS.length}</div>
          <div className="account-stat-label">Total Orders</div>
        </div>
        <div className="account-stat-card">
          <div className="account-stat-value">{formatPrice(totalSpent)}</div>
          <div className="account-stat-label">Total Spent</div>
        </div>
        <div className="account-stat-card">
          <div className="account-stat-value">{wishlistCount}</div>
          <div className="account-stat-label">Wishlist Items</div>
        </div>
      </div>

      {/* Recent orders */}
      <div className="account-recent-orders">
        <div className="account-section-header">
          <h3 className="account-section-title">Recent Orders</h3>
          <Link href="/account/orders" className="account-section-link">
            View all →
          </Link>
        </div>

        <div className="account-orders-list">
          {RECENT_ORDERS.map((order) => (
            <div key={order.id} className="account-order-row">
              <div className="account-order-meta">
                <span className="account-order-number">{order.number}</span>
                <span className="account-order-date">
                  {formatDate(order.date)}
                </span>
              </div>
              <div className="account-order-items">
                {order.itemsCount} item{order.itemsCount !== 1 ? "s" : ""}
              </div>
              <div className="account-order-total">
                {formatPrice(order.total)}
              </div>
              <span className={STATUS_CLASS[order.status] ?? "badge"}>
                {order.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────── */
export default function AccountPage() {
  const router      = useRouter();
  const [user, setUser]             = useState<StoredUser | null>(null);
  const [activeTab, setActiveTab]   = useState("profile");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem("srilatha_user");
    if (!raw) {
      router.replace("/login");
      return;
    }
    try {
      setUser(JSON.parse(raw));
    } catch {
      router.replace("/login");
      return;
    }
    setLoading(false);
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("srilatha_user");
    router.push("/login");
  }

  if (loading || !user) {
    return (
      <div className="account-loading">
        <div
          className="skeleton"
          style={{ width: 220, height: 28, borderRadius: 8, margin: "0 auto" }}
        />
      </div>
    );
  }

  return (
    <div className="account-page">
      <div className="container">
        {/* Breadcrumb */}
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className="breadcrumb-sep">›</span>
          <span className="current">My Account</span>
        </nav>

        {/* Mobile toggle */}
        <button
          className="account-mobile-toggle"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open account menu"
        >
          ☰ Account Menu
        </button>

        <div className="account-layout">
          {/* ── Sidebar overlay ── */}
          {sidebarOpen && (
            <div
              className="account-sidebar-overlay"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* ── Sidebar ── */}
          <aside className={`account-sidebar${sidebarOpen ? " open" : ""}`}>
            <button
              className="account-sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
            >
              ✕
            </button>

            <div className="account-sidebar-profile">
              <div className="account-avatar account-avatar-sm">
                {getInitials(user.name)}
              </div>
              <div>
                <div className="account-sidebar-name">{user.name}</div>
                <div className="account-sidebar-email">{user.email}</div>
              </div>
            </div>

            <nav className="account-nav">
              {NAV_ITEMS.map((item) =>
                item.href ? (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`account-nav-item${
                      activeTab === item.key ? " active" : ""
                    }`}
                    onClick={() => {
                      setActiveTab(item.key);
                      setSidebarOpen(false);
                    }}
                  >
                    <span className="account-nav-icon">{item.icon}</span>
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.key}
                    className={`account-nav-item${
                      activeTab === item.key ? " active" : ""
                    }`}
                    onClick={() => {
                      setActiveTab(item.key);
                      setSidebarOpen(false);
                    }}
                  >
                    <span className="account-nav-icon">{item.icon}</span>
                    {item.label}
                  </button>
                )
              )}
            </nav>

            <div className="account-sidebar-footer">
              <button className="account-logout-btn" onClick={handleLogout}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  width={16}
                  height={16}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"
                  />
                </svg>
                Sign Out
              </button>
            </div>
          </aside>

          {/* ── Main content ── */}
          <main className="account-content">
            {activeTab === "profile" && <ProfileSection user={user} />}
            {activeTab === "addresses" && <AddressesSection />}
            {activeTab === "invoices" && <InvoicesSection />}
          </main>
        </div>
      </div>
    </div>
  );
}
