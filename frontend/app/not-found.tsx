'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Product } from '@/lib/data';
import { getProductBySlug, listProducts, ApiError } from '@/lib/api';
import ProductDetailLayout from '@/components/shop/ProductDetailLayout';

/**
 * Themed 404 — also the runtime fallback for product detail pages whose slug
 * was created after the most recent static export. If the URL is /product/<slug>,
 * we try to fetch the product client-side and render the full detail UI in place.
 * If the slug really does not exist, or for any other unknown URL, we render the
 * themed "not found" panel below.
 */
export default function NotFound() {
  type State =
    | { kind: 'initial' }
    | { kind: 'loading-product'; slug: string }
    | { kind: 'product'; product: Product; related: Product[] }
    | { kind: 'missing-product'; slug: string }
    | { kind: 'generic' };

  const [state, setState] = useState<State>({ kind: 'initial' });

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/product\/([^/]+)\/?$/);
    if (!match) {
      setState({ kind: 'generic' });
      return;
    }
    const slug = decodeURIComponent(match[1]);
    setState({ kind: 'loading-product', slug });

    let cancelled = false;
    (async () => {
      try {
        const product = await getProductBySlug(slug);
        let related: Product[] = [];
        try {
          const all = await listProducts({ limit: 100 });
          related = all.products
            .filter((p) => p.category === product.category && p.id !== product.id)
            .slice(0, 4);
        } catch {
          // Related is best-effort; show the product without related items.
        }
        if (!cancelled) setState({ kind: 'product', product, related });
      } catch (err) {
        if (cancelled) return;
        // Treat any non-200 as missing rather than as a transient error — that
        // matches what the user sees on the live site for stale slugs.
        if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
          setState({ kind: 'missing-product', slug });
        } else {
          setState({ kind: 'missing-product', slug });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state.kind === 'product') {
    return <ProductDetailLayout product={state.product} related={state.related} />;
  }

  if (state.kind === 'loading-product') {
    return (
      <div className="page-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="loader-ring" aria-hidden="true" />
          <p style={{ marginTop: 'var(--sp-4)', color: 'var(--text-muted)', fontSize: '0.88rem' }}>Loading artwork…</p>
        </div>
        <style>{`
          .loader-ring {
            width: 44px; height: 44px;
            border-radius: 50%;
            border: 2px solid rgba(0,163,255,0.15);
            border-top-color: var(--accent-blue);
            margin: 0 auto;
            animation: lr-spin 0.9s linear infinite;
            box-shadow: var(--glow-blue);
          }
          @keyframes lr-spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  const isMissingProduct = state.kind === 'missing-product';

  return (
    <div className="not-found-wrap">
      <div className="not-found-card">
        <div className="not-found-glow" aria-hidden="true" />
        <span className="eyebrow not-found-eyebrow">
          {isMissingProduct ? 'Artwork Not Found' : '404 — Lost in the Studio'}
        </span>
        <h1 className="not-found-title">
          {isMissingProduct ? (
            <>This piece is no longer <span className="grad">available</span></>
          ) : (
            <>We couldn&apos;t find that <span className="grad">page</span></>
          )}
        </h1>
        <p className="not-found-sub">
          {isMissingProduct
            ? 'The artwork you were looking for may have been retired or the link is out of date. Try browsing the full collection — every piece is one of a kind.'
            : 'The link may be broken or the page may have moved. Let\'s get you back on track.'}
        </p>

        <div className="not-found-actions">
          <Link href="/shop" className="btn btn-primary btn-lg pulse-glow">
            ⚡ Browse all artworks
          </Link>
          <Link href="/" className="btn btn-secondary btn-lg">
            Back to home
          </Link>
        </div>

        <div className="not-found-links">
          <Link href="/shop?category=resin">Resin Art</Link>
          <span aria-hidden="true">·</span>
          <Link href="/shop?category=lippan">Lippan Art</Link>
          <span aria-hidden="true">·</span>
          <Link href="/shop?category=mandala">Dot Mandala</Link>
          <span aria-hidden="true">·</span>
          <Link href="/custom-order">Custom Order</Link>
          <span aria-hidden="true">·</span>
          <Link href="/contact">Contact</Link>
        </div>
      </div>

      <style>{`
        .not-found-wrap {
          min-height: calc(100vh - 200px);
          display: flex; align-items: center; justify-content: center;
          padding: var(--sp-10) var(--sp-4);
          background: var(--bg-base);
        }
        .not-found-card {
          position: relative;
          width: 100%; max-width: 640px;
          padding: var(--sp-10) var(--sp-8);
          background: var(--bg-card);
          border: 1px solid var(--border-mid);
          border-radius: var(--r-2xl);
          text-align: center;
          overflow: hidden;
          box-shadow: var(--shadow-lg), 0 0 60px rgba(0,163,255,0.06);
        }
        .not-found-glow {
          position: absolute; inset: -40% -10% auto auto;
          width: 320px; height: 320px;
          background: radial-gradient(circle, rgba(0,163,255,0.18), transparent 60%);
          pointer-events: none;
        }
        .not-found-eyebrow { display: inline-block; margin-bottom: var(--sp-4); }
        .not-found-title {
          font-family: var(--font-body);
          font-size: clamp(1.6rem, 5vw, 2.4rem);
          font-weight: 900;
          color: var(--text-primary);
          line-height: 1.15;
          letter-spacing: -0.02em;
          margin-bottom: var(--sp-3);
        }
        .not-found-title .grad {
          background: var(--gradient-brand);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .not-found-sub {
          font-size: 0.95rem;
          color: var(--text-secondary);
          line-height: 1.65;
          max-width: 460px;
          margin: 0 auto var(--sp-6);
        }
        .not-found-actions {
          display: flex; gap: var(--sp-3); justify-content: center; flex-wrap: wrap;
          margin-bottom: var(--sp-6);
        }
        .not-found-links {
          display: flex; flex-wrap: wrap; gap: var(--sp-3);
          justify-content: center;
          font-size: 0.82rem;
          color: var(--text-muted);
        }
        .not-found-links a {
          color: var(--text-secondary);
          text-decoration: none;
          transition: color var(--dur-fast);
        }
        .not-found-links a:hover { color: var(--accent-blue); }
        @media (max-width: 600px) {
          .not-found-actions .btn { width: 100%; }
        }
      `}</style>
    </div>
  );
}
