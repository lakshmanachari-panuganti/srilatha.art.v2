import type { NextConfig } from 'next';

// Asset hostname is environment-specific and injected via
// NEXT_PUBLIC_ASSET_BASE_URL (see frontend/.env.example and the deploy
// workflows). The same variable feeds frontend/lib/assets.ts at runtime
// and the next/image remotePatterns allowlist at build.
function resolveAssetHostname(): string | null {
  const explicit = process.env.NEXT_PUBLIC_ASSET_BASE_URL?.trim();
  if (!explicit) return null;
  try { return new URL(explicit).hostname; } catch { return null; }
}

const assetHostname = resolveAssetHostname();

if (!assetHostname && process.env.NODE_ENV === 'production') {
  throw new Error(
    'NEXT_PUBLIC_ASSET_BASE_URL is required for production builds. ' +
    'Set it in the deploy workflow (see .github/workflows/deploy-frontend-*.yml).'
  );
}

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      ...(assetHostname ? [{ protocol: 'https' as const, hostname: assetHostname }] : []),
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
