// ─── Product Data ────────────────────────────────────────────────────────────
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
  category: Category;
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

export const PRODUCTS: Product[] = [
  // ── RESIN ART (Primary) ───────────────────────────────────────────────────
  {
    id: "p001",
    slug: "ocean-blue-resin-wall-art",
    name: "Ocean Blue Resin Wall Art",
    category: "resin",
    price: 349900,
    images: ["/images/resin-art-hero.png", "/images/resin-ocean.png"],
    description:
      "A breathtaking ocean-inspired resin masterpiece. Deep teal and ocean blue epoxy resin poured in flowing layers, finished with 24k gold leaf flakes that catch the light beautifully. Each piece is unique — the resin flows create a one-of-a-kind pattern impossible to replicate.",
    shortDesc: "Deep teal & gold leaf epoxy resin, 30cm circle",
    material: "Epoxy resin, 24k gold leaf, acrylic pigments on MDF base",
    careInstructions:
      "Wipe gently with a dry cloth. Avoid direct sunlight for prolonged periods. Do not use chemical cleaners.",
    dimensions: "30cm × 30cm (circle)",
    rating: 4.9,
    reviewCount: 47,
    inStock: true,
    stockCount: 8,
    isBestSeller: true,
    tags: ["resin", "wall-art", "blue", "gold", "circle"],
  },
  {
    id: "p002",
    slug: "amethyst-geode-resin-art",
    name: "Amethyst Geode Resin Art",
    category: "resin",
    price: 489900,
    originalPrice: 549900,
    images: ["/images/resin-geode.png", "/images/resin-art-hero.png"],
    description:
      "Inspired by the raw beauty of amethyst geodes found in nature. Deep purple, dusty rose and pearl white resin layers are built up to create a crystalline geode effect, then finished with real gold leaf veining. A stunning statement piece for any wall.",
    shortDesc: "Purple & rose geode effect with gold veins, 45cm circle",
    material: "Epoxy resin, mica powder, gold leaf, crystal pigments on wood panel",
    careInstructions:
      "Keep away from direct sunlight. Clean with a soft, dry cloth. Do not submerge in water.",
    dimensions: "45cm × 45cm (circle)",
    rating: 4.8,
    reviewCount: 31,
    inStock: true,
    stockCount: 5,
    isNewArrival: true,
    tags: ["resin", "geode", "purple", "gold", "large"],
  },
  {
    id: "p003",
    slug: "ocean-wave-resin-triptych",
    name: "Ocean Wave Resin Triptych",
    category: "resin",
    price: 799900,
    images: ["/images/resin-ocean.png", "/images/resin-art-hero.png"],
    description:
      "Three panels that together form a continuous ocean seascape. Translucent turquoise and navy resin, white pigment foam crests and a warm sandy base — the panels are designed to hang together as one cohesive artwork or separately.",
    shortDesc: "3-panel ocean seascape, 60×40cm each",
    material: "Epoxy resin, acrylic pigments, metallic inks on stretched canvas",
    careInstructions:
      "Dust with a soft brush. Avoid humid environments. Keep away from direct heat sources.",
    dimensions: "Each panel: 60cm × 40cm",
    rating: 5.0,
    reviewCount: 18,
    inStock: true,
    stockCount: 3,
    isBestSeller: true,
    tags: ["resin", "ocean", "triptych", "set", "blue"],
  },
  {
    id: "p004",
    slug: "black-gold-resin-tray",
    name: "Black & Gold Resin Serving Tray",
    category: "resin",
    price: 229900,
    originalPrice: 279900,
    images: ["/images/resin-tray-gold.png", "/images/resin-coasters.png"],
    description:
      "A functional work of art for your home. Black epoxy resin with dramatic gold swirl patterns and 24k gold flake accents. The glossy surface is both beautiful and practical — perfect for serving or display.",
    shortDesc: "Black & 24k gold swirl oval tray, 35×25cm",
    material: "Epoxy resin, 24k gold leaf, food-safe topcoat",
    careInstructions:
      "Hand wash gently with mild soap. Do not put in dishwasher. Avoid abrasive cleaners.",
    dimensions: "35cm × 25cm (oval)",
    rating: 4.7,
    reviewCount: 62,
    inStock: true,
    stockCount: 12,
    isSale: true,
    tags: ["resin", "tray", "black", "gold", "functional"],
  },
  {
    id: "p005",
    slug: "mandala-resin-coasters-set",
    name: "Mandala Resin Coasters (Set of 4)",
    category: "resin",
    price: 149900,
    images: ["/images/resin-coasters.png", "/images/resin-tray-gold.png"],
    description:
      "A set of four unique resin coasters, each featuring a different Indian folk art mandala pattern. Saffron, peacock blue, forest green and burgundy — each coaster is hand-painted in gold ink then sealed in crystal-clear epoxy resin.",
    shortDesc: "Set of 4 hand-painted mandala resin coasters, 10cm each",
    material: "Epoxy resin, acrylic paints, gold ink, cork base",
    careInstructions: "Wipe clean with damp cloth. Not dishwasher safe.",
    dimensions: "10cm × 10cm (each), set of 4",
    rating: 4.8,
    reviewCount: 94,
    inStock: true,
    stockCount: 20,
    isBestSeller: true,
    tags: ["resin", "coasters", "mandala", "set", "gift"],
  },
  {
    id: "p006",
    slug: "floral-resin-preservation-art",
    name: "Preserved Florals Resin Art",
    category: "resin",
    price: 289900,
    images: ["/images/resin-flowers.png", "/images/resin-geode.png"],
    description:
      "Real dried flowers and botanicals preserved forever in crystal-clear resin. Blush pink and cream background with actual dried roses, baby's breath and pressed leaves suspended inside. A timeless piece that brings nature indoors.",
    shortDesc: "Real dried florals in crystal-clear resin, 30×30cm",
    material: "Epoxy resin, real dried flowers, botanical elements on MDF",
    careInstructions: "Avoid direct sunlight to preserve flower colours. Wipe with dry cloth.",
    dimensions: "30cm × 30cm (square)",
    rating: 4.9,
    reviewCount: 29,
    inStock: true,
    stockCount: 6,
    isNewArrival: true,
    tags: ["resin", "floral", "preserved", "pink", "botanical"],
  },
  // ── LIPPAN ART ────────────────────────────────────────────────────────────
  {
    id: "p007",
    slug: "lippan-geometric-wall-panel",
    name: "Lippan Geometric Wall Panel",
    category: "lippan",
    price: 189900,
    images: ["/images/lippan-art.png"],
    description:
      "Traditional Kutchi Lippan kaam — a centuries-old folk art form from Gujarat. Mud clay relief work with geometric diamond and chevron patterns, embedded with tiny real mirror pieces that catch and scatter light beautifully.",
    shortDesc: "Traditional Kutch clay mirror work, 40×40cm",
    material: "Natural clay, mirror pieces, acrylic paint, wooden board",
    careInstructions: "Keep dry. Dust gently with a soft brush. Do not expose to water.",
    dimensions: "40cm × 40cm",
    rating: 4.7,
    reviewCount: 23,
    inStock: true,
    stockCount: 7,
    isBestSeller: true,
    tags: ["lippan", "clay", "mirror", "geometric", "folk-art"],
  },
  // ── DOT MANDALA ────────────────────────────────────────────────────────────
  {
    id: "p008",
    slug: "jewel-tone-dot-mandala",
    name: "Jewel Tone Dot Mandala",
    category: "mandala",
    price: 159900,
    images: ["/images/dot-mandala.png"],
    description:
      "A meticulously hand-dotted mandala on black stone canvas. Each dot is placed by hand using dotting tools, building up intricate concentric circles in vibrant jewel tones — ruby, sapphire, emerald and gold.",
    shortDesc: "Hand-dotted acrylic mandala on black stone, 30cm",
    material: "Acrylic paints, dotting tools, MDF stone-finish canvas",
    careInstructions: "Do not wipe. Frame under glass for protection.",
    dimensions: "30cm circle",
    rating: 4.9,
    reviewCount: 41,
    inStock: true,
    stockCount: 4,
    tags: ["mandala", "dots", "jewel-tones", "black", "circle"],
  },
  // ── KOLAM ART ─────────────────────────────────────────────────────────────
  {
    id: "p009",
    slug: "kolam-lotus-canvas",
    name: "Kolam Lotus Canvas",
    category: "kolam",
    price: 119900,
    images: ["/images/kolam-art.png"],
    description:
      "Traditional South Indian Kolam art rendered on canvas. Intricate white geometric lines form a lotus and peacock motif on deep indigo background — a digital-age preservation of a living floor-art tradition.",
    shortDesc: "Traditional Kolam lotus pattern on indigo canvas, 40×40cm",
    material: "Acrylic paints on stretched canvas",
    careInstructions: "Avoid moisture. Dust with a soft, dry brush.",
    dimensions: "40cm × 40cm",
    rating: 4.6,
    reviewCount: 17,
    inStock: true,
    stockCount: 9,
    tags: ["kolam", "lotus", "indigo", "traditional", "South-Indian"],
  },
  // ── WEDDING DECOR ─────────────────────────────────────────────────────────
  {
    id: "p010",
    slug: "wedding-welcome-resin-sign",
    name: "Wedding Welcome Resin Sign",
    category: "wedding",
    price: 599900,
    images: ["/images/wedding-decor.png"],
    description:
      "A bespoke handmade resin welcome sign for your wedding. Burgundy and gold resin on an acrylic base, customisable with your names and wedding date. Comes with an easel stand. Makes a stunning backdrop focal point or table display.",
    shortDesc: "Customisable resin welcome sign with gold lettering",
    material: "Epoxy resin, acrylic base, 24k gold leaf, easel stand included",
    careInstructions: "Handle with care. Store upright. Clean with dry cloth.",
    dimensions: "60cm × 45cm (custom sizes available)",
    rating: 5.0,
    reviewCount: 12,
    inStock: true,
    stockCount: 3,
    tags: ["wedding", "sign", "custom", "burgundy", "gold"],
  },
  // ── GIFTS ─────────────────────────────────────────────────────────────────
  {
    id: "p011",
    slug: "folk-art-gift-set",
    name: "Folk Art Gift Set",
    category: "gifts",
    price: 299900,
    originalPrice: 349900,
    images: ["/images/gift-items.png", "/images/resin-coasters.png"],
    description:
      "A curated gift set featuring the best of Srilatha Art — 2 resin mandala coasters, 1 Lippan art keychain, and 2 dotted mandala bookmarks, all beautifully packaged in a gift box. Perfect for Diwali, birthdays or housewarmings.",
    shortDesc: "Curated gift set — coasters, keychain & bookmarks",
    material: "Mixed: resin, clay, acrylic",
    careInstructions: "See individual item care instructions.",
    dimensions: "Gift box: 25cm × 20cm",
    rating: 4.8,
    reviewCount: 56,
    inStock: true,
    stockCount: 15,
    isSale: true,
    tags: ["gift", "set", "diwali", "mixed", "curated"],
  },
];

export const CATEGORIES = [
  { id: "all",     label: "All",          emoji: "✨", count: PRODUCTS.length },
  { id: "resin",   label: "Resin Art",    emoji: "🔮", count: PRODUCTS.filter(p => p.category === "resin").length },
  { id: "lippan",  label: "Lippan Art",   emoji: "🪞", count: PRODUCTS.filter(p => p.category === "lippan").length },
  { id: "mandala", label: "Dot Mandala",  emoji: "🔵", count: PRODUCTS.filter(p => p.category === "mandala").length },
  { id: "kolam",   label: "Kolam Art",    emoji: "🌸", count: PRODUCTS.filter(p => p.category === "kolam").length },
  { id: "wedding", label: "Wedding Decor",emoji: "💍", count: PRODUCTS.filter(p => p.category === "wedding").length },
  { id: "gifts",   label: "Gifts",        emoji: "🎁", count: PRODUCTS.filter(p => p.category === "gifts").length },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────
export const formatPrice = (paise: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

export const getProductBySlug = (slug: string) =>
  PRODUCTS.find((p) => p.slug === slug);

export const getProductsByCategory = (category: string) =>
  category === "all"
    ? PRODUCTS
    : PRODUCTS.filter((p) => p.category === category);

export const getBestSellers = () => PRODUCTS.filter((p) => p.isBestSeller);
export const getNewArrivals = () => PRODUCTS.filter((p) => p.isNewArrival);
export const getSaleProducts = () => PRODUCTS.filter((p) => p.isSale);

// ─── Reviews ─────────────────────────────────────────────────────────────────
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

export const REVIEWS: Review[] = [
  {
    id: "r001",
    productId: "p001",
    author: "Priya Sharma",
    city: "Mumbai",
    rating: 5,
    title: "Absolutely stunning piece!",
    body: "I ordered the ocean blue resin art for my living room and it's honestly more beautiful in person. The gold flakes catch the light in the evening and it looks magical. Srilatha packed it beautifully too. Will definitely order again!",
    date: "2024-11-15",
    verified: true,
  },
  {
    id: "r002",
    productId: "p005",
    author: "Ananya Krishnan",
    city: "Bengaluru",
    rating: 5,
    title: "Perfect gift!",
    body: "Bought the coaster set as a housewarming gift — my friend was absolutely delighted. Each coaster is slightly different and the mandala patterns are so detailed. Worth every rupee.",
    date: "2024-12-02",
    verified: true,
  },
  {
    id: "r003",
    productId: "p003",
    author: "Meera Iyer",
    city: "Coimbatore",
    rating: 5,
    title: "The triptych is EVERYTHING",
    body: "The ocean wave triptych arrived safely packed and looks incredible on my dining room wall. It's large, bold and draws every guest's eye immediately. Couldn't be happier.",
    date: "2025-01-08",
    verified: true,
  },
  {
    id: "r004",
    productId: "p007",
    author: "Sunita Patil",
    city: "Pune",
    rating: 4,
    title: "Beautiful folk art, authentic feel",
    body: "The Lippan panel is exactly as described. The mirrors catch light beautifully. My only wish was it was slightly larger. Will order the bigger version next time.",
    date: "2025-01-22",
    verified: true,
  },
  {
    id: "r005",
    productId: "p002",
    author: "Deepa Reddy",
    city: "Hyderabad",
    rating: 5,
    title: "Looks like a real geode!",
    body: "The amethyst geode art is so realistic it had my guests asking if it was a real geode slice framed. The layers of resin are gorgeous, the gold veins are delicate and perfect. 10/10.",
    date: "2025-02-14",
    verified: true,
  },
  {
    id: "r006",
    productId: "p006",
    author: "Lakshmi Nair",
    city: "Kochi",
    rating: 5,
    title: "Bought for my wedding anniversary",
    body: "I had roses from my wedding preserved in this resin piece for our anniversary. Srilatha helped me through the whole process. The final piece is absolutely beautiful and so personal. Will treasure it forever.",
    date: "2025-03-01",
    verified: true,
  },
];



