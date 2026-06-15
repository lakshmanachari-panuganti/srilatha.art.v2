'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';

export default function AnnouncementBar() {
  const [visible, setVisible] = useState(true);
  const pathname = usePathname();
  if (pathname.startsWith('/admin')) return null;
  if (!visible) return null;

  return (
    <div className="announcement-bar" role="banner" aria-label="Announcement">
      <span className="announcement-text">
        ✨ Free shipping on orders above ₹999 &nbsp;·&nbsp; Use code{' '}
        <strong className="highlight">FIRST10</strong> for 10% off your first order
        &nbsp;·&nbsp;
        <a href="/shop" className="highlight" style={{ marginLeft: 4, fontWeight: 700 }}>
          Shop Now →
        </a>
      </span>
      <button
        onClick={() => setVisible(false)}
        className="announcement-close"
        aria-label="Close announcement"
      >
        ×
      </button>
    </div>
  );
}
