"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/data";
import { formatPrice } from "@/lib/data";
import { useCart } from "@/components/cart/CartProvider";

/* ─────────────────────────────────────────────────────────────────
   Image Gallery with thumbnail switching
───────────────────────────────────────────────────────────────── */
interface ImageGalleryProps {
  images: string[];
  productName: string;
}

export function ImageGallery({ images, productName }: ImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {/* Main Image */}
      <div
        style={{
          position: "relative",
          aspectRatio: "1 / 1",
          borderRadius: "var(--radius-xl)",
          overflow: "hidden",
          background: "var(--color-cream-dark)",
          boxShadow: "var(--shadow-md)",
        }}
        className="product-main-image"
      >
        <Image
          src={images[activeIndex]}
          alt={`${productName} — image ${activeIndex + 1}`}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 50vw"
          style={{ objectFit: "cover", transition: "opacity 0.25s ease" }}
        />
      </div>

      {/* Thumbnail Strip */}
      {images.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
        >
          {images.map((src, idx) => (
            <button
              key={src}
              onClick={() => setActiveIndex(idx)}
              aria-label={`View image ${idx + 1}`}
              aria-pressed={idx === activeIndex}
              style={{
                flexShrink: 0,
                width: 72,
                height: 72,
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                border: idx === activeIndex
                  ? "2.5px solid var(--color-gold)"
                  : "2.5px solid transparent",
                cursor: "pointer",
                padding: 0,
                background: "var(--color-cream-dark)",
                transition: "border-color var(--duration-fast) var(--ease-smooth)",
                position: "relative",
              }}
            >
              <Image
                src={src}
                alt={`Thumbnail ${idx + 1}`}
                fill
                sizes="72px"
                style={{ objectFit: "cover" }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Product Tabs
───────────────────────────────────────────────────────────────── */
interface TabsProps {
  description: string;
  material: string;
  careInstructions: string;
  dimensions: string;
}

const TAB_LIST = [
  { id: "description", label: "Description" },
  { id: "materials",   label: "Materials" },
  { id: "care",        label: "Care Guide" },
  { id: "shipping",    label: "Shipping" },
] as const;

type TabId = (typeof TAB_LIST)[number]["id"];

export function ProductTabs({ description, material, careInstructions, dimensions }: TabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("description");

  const content: Record<TabId, React.ReactNode> = {
    description: (
      <div style={{ lineHeight: 1.8, color: "var(--color-charcoal)" }}>
        <p style={{ marginBottom: "var(--space-4)" }}>{description}</p>
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--color-gold-dark)",
            background: "var(--color-gold-pale)",
            padding: "var(--space-3) var(--space-4)",
            borderRadius: "var(--radius-md)",
            borderLeft: "3px solid var(--color-gold)",
          }}
        >
          <strong>Dimensions:</strong> {dimensions}
        </p>
      </div>
    ),
    materials: (
      <div style={{ lineHeight: 1.8, color: "var(--color-charcoal)" }}>
        <p style={{ marginBottom: "var(--space-3)" }}>
          Every Srilatha Art piece is crafted from carefully sourced,
          high-quality materials.
        </p>
        <p
          style={{
            background: "var(--color-cream-dark)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
            fontSize: "0.9rem",
          }}
        >
          {material}
        </p>
      </div>
    ),
    care: (
      <div style={{ lineHeight: 1.8, color: "var(--color-charcoal)" }}>
        <p style={{ marginBottom: "var(--space-3)" }}>
          Follow these simple guidelines to keep your artwork looking beautiful
          for years to come.
        </p>
        <p
          style={{
            background: "var(--color-cream-dark)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
            fontSize: "0.9rem",
          }}
        >
          {careInstructions}
        </p>
      </div>
    ),
    shipping: (
      <div style={{ lineHeight: 1.8, color: "var(--color-charcoal)" }}>
        <ul
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            fontSize: "0.9rem",
          }}
        >
          {[
            ["📦", "Made to order", "Please allow 5–7 working days for production before dispatch."],
            ["🚚", "Free shipping", "On all orders above ₹500. Standard delivery 3–5 days across India."],
            ["🛡️", "Safe packaging", "Bubble-wrapped and double-boxed to arrive in perfect condition."],
            ["🔄", "Returns", "Damaged on arrival? We'll replace or refund — no questions asked."],
          ].map(([icon, title, detail]) => (
            <li
              key={title}
              style={{
                display: "flex",
                gap: "var(--space-3)",
                padding: "var(--space-3)",
                background: "var(--color-cream-dark)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <span style={{ fontSize: "1.2rem", flexShrink: 0 }}>{icon}</span>
              <div>
                <strong style={{ display: "block", fontSize: "0.875rem", marginBottom: 2 }}>
                  {title}
                </strong>
                <span style={{ fontSize: "0.82rem", color: "#7A6A50" }}>{detail}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    ),
  };

  return (
    <div style={{ marginTop: "var(--space-6)" }}>
      {/* Tab List */}
      <div
        role="tablist"
        aria-label="Product information"
        style={{
          display: "flex",
          borderBottom: "2px solid var(--color-border)",
          gap: 0,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {TAB_LIST.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "var(--space-3) var(--space-5)",
              fontFamily: "var(--font-body)",
              fontSize: "0.85rem",
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? "var(--color-gold)" : "#7A6A50",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab.id
                ? "2px solid var(--color-gold)"
                : "2px solid transparent",
              cursor: "pointer",
              whiteSpace: "nowrap",
              marginBottom: -2,
              transition: "all var(--duration-fast) var(--ease-smooth)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panel */}
      {TAB_LIST.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={activeTab !== tab.id}
          style={{ padding: "var(--space-6) 0" }}
        >
          {content[tab.id]}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Quantity Selector + Add to Cart + Wishlist
───────────────────────────────────────────────────────────────── */
interface ProductActionsProps {
  product: Product;
}

export default function ProductActions({ product }: ProductActionsProps) {
  const [quantity, setQuantity] = useState(1);
  const [wishlisted, setWishlisted] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const { addItem } = useCart();

  const maxQty = Math.min(product.stockCount, 10);

  const handleAddToCart = () => {
    addItem(product, quantity);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2500);
  };

  const whatsappMsg = encodeURIComponent(
    `Hi Srilatha! I'm interested in "${product.name}" (${formatPrice(product.price)}). Could you tell me more?`
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Qty selector */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
        <span className="text-label text-muted">Quantity</span>
        <div className="qty-control">
          <button
            className="qty-btn"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="qty-num" aria-live="polite">{quantity}</span>
          <button
            className="qty-btn"
            onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
            disabled={quantity >= maxQty}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>

      {/* Add to Cart */}
      <button
        className={`btn btn-full btn-lg ${addedToCart ? "btn-outline-gold" : "btn-primary"}`}
        onClick={handleAddToCart}
        disabled={!product.inStock}
        style={{ fontSize: "0.95rem" }}
      >
        {addedToCart ? (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 18, height: 18 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Added to Cart!
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 18, height: 18 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Add to Cart
          </>
        )}
      </button>

      {/* Wishlist */}
      <button
        className={`btn btn-full btn-outline${wishlisted ? "-gold" : ""}`}
        onClick={() => setWishlisted((w) => !w)}
        aria-pressed={wishlisted}
        style={{ fontSize: "0.875rem" }}
      >
        <svg viewBox="0 0 24 24" fill={wishlisted ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} style={{ width: 18, height: 18 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        {wishlisted ? "Saved to Wishlist" : "Add to Wishlist"}
      </button>

      {/* WhatsApp */}
      <Link
        href={`https://wa.me/919999999999?text=${whatsappMsg}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-whatsapp btn-full"
        style={{ fontSize: "0.875rem" }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18 }} aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Chat about this piece
      </Link>
    </div>
  );
}
