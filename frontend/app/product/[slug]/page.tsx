import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Product } from '@/lib/data';
import ProductDetailLayout from '@/components/shop/ProductDetailLayout';

// Build-time data fetching. Static export needs the slug list up front; the
// not-found.tsx fallback handles slugs that were created after the last deploy
// by fetching from the API in the browser.
const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:7071/api'
).replace(/\/+$/, '');

async function fetchAllProducts(): Promise<Product[]> {
  try {
    const res = await fetch(`${API_BASE}/products?limit=200`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json() as { products?: Product[] };
    return data.products ?? [];
  } catch {
    return [];
  }
}

async function fetchProductBySlug(slug: string): Promise<Product | null> {
  try {
    const res = await fetch(`${API_BASE}/products/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json() as Product;
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const all = await fetchAllProducts();
  if (all.length === 0) {
    // Next.js 15 + output:'export' rejects an empty `generateStaticParams`
    // result. Emit a single placeholder so the build succeeds even when the
    // products API is unreachable at deploy time; the placeholder slug 404s at
    // request time and `app/not-found.tsx` then performs a client-side fetch
    // by URL — which is the same path real-but-stale slugs take when a new
    // product is added after the last frontend deploy.
    return [{ slug: '__placeholder' }];
  }
  return all.map(p => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProductBySlug(slug);
  if (!product) return { title: 'Product Not Found' };
  return {
    title: product.name,
    description: product.shortDesc,
    openGraph: { title: `${product.name} | Srilatha Art`, description: product.shortDesc, images: product.images?.[0] ? [{ url: product.images[0] }] : [] },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await fetchProductBySlug(slug);
  if (!product) notFound();

  const allProducts = await fetchAllProducts();
  const related = allProducts.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4);

  return <ProductDetailLayout product={product} related={related} />;
}
