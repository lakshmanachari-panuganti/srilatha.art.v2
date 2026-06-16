// ─── Product / Review Types ──────────────────────────────────────────────────
// All data is served from the backend API (/api/products, /api/reviews).
// Do NOT reintroduce a hardcoded PRODUCTS array — the storefront must reflect
// what the admin has actually created in Azure Table Storage.

export type Category =
  | "resin"
  | "lippan"
  | "mandala"
  | "kolam"
  | "wedding"
  | "gifts";

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: Category | string;
  price: number;      // in paise
  originalPrice?: number;
  images: string[];
  description: string;
  shortDesc: string;
  material: string;
  careInstructions: string;
  dimensions: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  stockCount: number;
  isBestSeller?: boolean;
  isNewArrival?: boolean;
  isSale?: boolean;
  tags: string[];
}

export interface Review {
  id: string;
  productId: string;
  author: string;
  city: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verified: boolean;
}

export const CATEGORIES = [
  { id: "all",     label: "All" },
  { id: "resin",   label: "Resin Art" },
  { id: "lippan",  label: "Lippan Art" },
  { id: "mandala", label: "Dot Mandala" },
  { id: "kolam",   label: "Kolam Art" },
  { id: "wedding", label: "Wedding Decor" },
  { id: "gifts",   label: "Gifts" },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────
export const formatPrice = (paise: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
