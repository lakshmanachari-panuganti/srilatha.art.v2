import type { Metadata, Viewport } from 'next';
import './globals.css';

import AnnouncementBar from '@/components/layout/AnnouncementBar';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { CartProvider } from '@/components/cart/CartProvider';
import { WishlistProvider } from '@/components/wishlist/WishlistProvider';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { AdminAuthProvider } from '@/components/admin/AdminAuthProvider';
import { RuntimeConfigProvider } from '@/components/runtime/RuntimeConfigProvider';
import GoogleAuthGate from '@/components/runtime/GoogleAuthGate';

// NOTE: We use a <link> tag for Google Fonts instead of next/font/google
// because next/font downloads fonts at build time which fails on networks
// that block fonts.googleapis.com (corporate/VPN environments).
// The <link> tag loads fonts in the browser at runtime — no build-time download needed.

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#090B10',
};

export const metadata: Metadata = {
  title: {
    default: 'Srilatha Art — Handcrafted Resin Art & Indian Folk Art',
    template: '%s | Srilatha Art',
  },
  description: 'Premium handmade art by Srilatha — Resin Art, Lippan Art, Dot Mandala, Kolam Art, Wedding Decor & Gift Sets. Ships pan-India. Order custom pieces.',
  keywords: ['resin art india', 'handmade resin art', 'lippan art', 'dot mandala', 'kolam art', 'buy handmade art india', 'custom art order'],
  authors: [{ name: 'Srilatha', url: 'https://srilatha.art' }],
  creator: 'Srilatha Art',
  publisher: 'Srilatha Art',
  metadataBase: new URL('https://srilatha.art'),
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: 'Srilatha Art',
    title: 'Srilatha Art — Handcrafted Resin Art & Indian Folk Art',
    description: 'Premium handmade art — Resin Art, Lippan Art, Dot Mandala & more. Ships pan-India.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Srilatha Art' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Srilatha Art — Handcrafted Resin Art',
    description: 'Premium handmade Indian folk art. Resin Art, Lippan Art, Dot Mandala & more.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect for faster font loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/*
          Load fonts via <link> (browser runtime) instead of next/font/google (build-time download).
          This avoids the "Failed to download font" error on networks blocking fonts.googleapis.com.
        */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&family=Playfair+Display:ital,wght@0,700;1,400&display=swap"
        />
      </head>
      <body>
        <RuntimeConfigProvider>
          <GoogleAuthGate>
            <AuthProvider>
              <AdminAuthProvider>
                <CartProvider>
                  <WishlistProvider>
                    <a href="#main-content" className="skip-link">Skip to main content</a>
                    <AnnouncementBar />
                    <Header />
                    <main id="main-content">
                      {children}
                    </main>
                    <Footer />
                    <WhatsAppFloat />
                  </WishlistProvider>
                </CartProvider>
              </AdminAuthProvider>
            </AuthProvider>
          </GoogleAuthGate>
        </RuntimeConfigProvider>
      </body>
    </html>
  );
}
