import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import ShopClient from './ShopClient';

export const metadata: Metadata = {
  title: 'Shop Handmade Art — Resin, Lippan, Mandala, Kolam',
  description: 'Browse all handmade artworks by Srilatha. Resin Art, Lippan Art, Dot Mandala, Kolam Art, Wedding Decor & Gift Sets. Free shipping above ₹999.',
};

// No props needed since searchParams are read in client
export default function ShopPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', padding: 'var(--sp-8) 0 var(--sp-20)' }}>
      <div className="container">
        <Suspense fallback={<div style={{ padding: 'var(--sp-20)', textAlign: 'center', color: 'var(--text-muted)' }}>Loading artworks...</div>}>
          <ShopClient />
        </Suspense>
      </div>
    </div>
  );
}
