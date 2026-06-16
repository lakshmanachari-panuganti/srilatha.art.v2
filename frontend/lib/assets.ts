// Central source of truth for blob-hosted assets.
//
// The asset base URL is injected at build time per environment via
// NEXT_PUBLIC_ASSET_BASE_URL, set by the GitHub Actions workflow:
//   DEV → https://stsrilathaartv2dev.blob.core.windows.net/products
//   PRD → https://stsrilathaartv2prd.blob.core.windows.net/products
//
// For local development, set the same variable in frontend/.env.local
// (see frontend/.env.example). When unset, helpers return a transparent
// placeholder rather than a wrong-environment URL.

const RAW = process.env.NEXT_PUBLIC_ASSET_BASE_URL?.trim() ?? '';
export const BLOB_BASE = RAW.replace(/\/+$/, '');
export const SEED_BASE = BLOB_BASE ? `${BLOB_BASE}/seed` : '';

const TRANSPARENT_PIXEL =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

export const seedImg = (filename: string): string =>
  SEED_BASE ? `${SEED_BASE}/${filename}` : TRANSPARENT_PIXEL;

export const PLACEHOLDER_PRODUCT_IMG = seedImg('resin-art-hero.png');

if (typeof window === 'undefined' && process.env.NODE_ENV === 'production' && !BLOB_BASE) {
  // Build-time guard: fail loudly so a misconfigured pipeline can't ship
  // a production bundle that points at the wrong storage account.
  throw new Error(
    'NEXT_PUBLIC_ASSET_BASE_URL is required for production builds. ' +
    'Set it in the deploy workflow (see .github/workflows/deploy-frontend-*.yml).'
  );
}
