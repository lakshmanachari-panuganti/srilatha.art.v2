"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";

// ─── Types ───────────────────────────────────────────────────────────────────
interface FormData {
  name: string;
  email: string;
  phone: string;
  artType: string;
  dimensions: string;
  colorPreferences: string;
  occasion: string;
  budget: string;
  description: string;
  referenceUrl: string;
  agreeTerms: boolean;
}

interface FormErrors {
  name?: string;
  email?: string;
  phone?: string;
  artType?: string;
  budget?: string;
  description?: string;
  agreeTerms?: string;
}

const INITIAL_FORM: FormData = {
  name: "",
  email: "",
  phone: "",
  artType: "",
  dimensions: "",
  colorPreferences: "",
  occasion: "",
  budget: "",
  description: "",
  referenceUrl: "",
  agreeTerms: false,
};

const HOW_IT_WORKS = [
  {
    step: 1,
    icon: "💬",
    title: "Share Your Idea",
    desc: "Fill out the commission form below with your vision — dimensions, colours, occasion and any references you have. The more detail, the better!",
  },
  {
    step: 2,
    icon: "📞",
    title: "Free Consultation",
    desc: "Srilatha will personally review your request and contact you within 24 hours via WhatsApp or email to discuss your piece, finalise the design and provide a quote.",
  },
  {
    step: 3,
    icon: "🎨",
    title: "Craft & Deliver",
    desc: "Once approved and payment received, your piece is handcrafted with love over 4–6 weeks. It is then carefully packaged and shipped directly to your door.",
  },
];

const FAQ = [
  {
    q: "Is there a minimum order value?",
    a: "Custom orders start from ₹2,000. The price depends on the art type, dimensions, complexity and materials used. You will receive a detailed quote after the free consultation.",
  },
  {
    q: "How long does a custom piece take?",
    a: "Most custom orders take 4–6 weeks from design approval and payment to delivery. Urgent requests (2–3 weeks) may be possible for an additional rush fee — do mention this in your request.",
  },
  {
    q: "Can I see work-in-progress photos?",
    a: "Absolutely! Srilatha shares progress photos at key stages via WhatsApp so you can see your piece coming to life. You will be kept in the loop throughout the process.",
  },
  {
    q: "How many revisions are included?",
    a: "Two rounds of revisions are included in the price — one at the design/sketch stage before any materials are purchased, and one before the final sealing/finishing stage.",
  },
  {
    q: "What if I'm not happy with the final piece?",
    a: "Your satisfaction is our priority. If the finished piece significantly deviates from the agreed design, we will work to make it right. Please review our full custom order policy for details.",
  },
  {
    q: "Do you ship outside India?",
    a: "Currently we ship within India only. International shipping for custom orders may be arranged on request for select countries — contact us directly to discuss.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function CustomOrderPage() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate(): boolean {
    const newErrors: FormErrors = {};
    if (!form.name.trim()) newErrors.name = "Your name is required.";
    if (!form.email.trim()) {
      newErrors.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Please enter a valid email address.";
    }
    if (!form.phone.trim()) {
      newErrors.phone = "Phone / WhatsApp number is required.";
    } else if (!/^[\d\s+\-()\u200d]{7,15}$/.test(form.phone)) {
      newErrors.phone = "Please enter a valid phone number.";
    }
    if (!form.artType) newErrors.artType = "Please select an art type.";
    if (!form.budget) newErrors.budget = "Please select a budget range.";
    if (!form.description.trim()) {
      newErrors.description = "Please describe your vision — this helps us create something truly special!";
    } else if (form.description.trim().length < 30) {
      newErrors.description = "Please provide at least 30 characters so we understand your vision.";
    }
    if (!form.agreeTerms) {
      newErrors.agreeTerms = "Please agree to the custom order terms to proceed.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 1400));
    setIsSubmitting(false);
    setSubmitted(true);
  }

  // ── Field helpers ────────────────────────────────────────────────────────────
  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value, type } = e.target;
    const checked = type === "checkbox" ? (e.target as HTMLInputElement).checked : undefined;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  // ── WhatsApp link ────────────────────────────────────────────────────────────
  const whatsappMsg = encodeURIComponent(
    `Hi Srilatha! I'd love to commission a custom ${form.artType || "art"} piece. I've submitted the form — looking forward to hearing from you!`
  );
  const whatsappUrl = `https://wa.me/919876543210?text=${whatsappMsg}`;

  // ─── Success State ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="co-success-wrap">
        <div className="container">
          <div className="co-success-card animate-scaleIn">
            <div className="co-success-icon">🎨</div>
            <h1 className="display-md">Commission Request Received!</h1>
            <p className="text-body-lg text-muted co-success-sub">
              Thank you, <strong>{form.name}</strong>! Srilatha will personally review your request
              and get back to you within <strong>24 hours</strong> via WhatsApp or email.
            </p>
            <div className="co-success-details">
              <div className="co-success-detail">
                <span>📧</span>
                <span>Confirmation sent to <strong>{form.email}</strong></span>
              </div>
              <div className="co-success-detail">
                <span>⏱️</span>
                <span>Expect a reply within <strong>24 hours</strong></span>
              </div>
              <div className="co-success-detail">
                <span>🎁</span>
                <span>Your bespoke <strong>{form.artType}</strong> piece awaits</span>
              </div>
            </div>
            <div className="co-success-actions">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-whatsapp btn-lg"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Chat on WhatsApp
              </a>
              <Link href="/shop" className="btn btn-outline btn-lg">
                Browse the Shop
              </Link>
            </div>
          </div>
        </div>
        <style>{`
          .co-success-wrap{min-height:70vh;display:flex;align-items:center;padding:var(--space-16) 0;background:var(--color-cream);}
          .co-success-card{max-width:600px;margin:0 auto;background:#fff;border-radius:var(--radius-xl);padding:var(--space-12) var(--space-8);text-align:center;box-shadow:var(--shadow-lg);border:1px solid var(--color-border);}
          .co-success-icon{font-size:4rem;margin-bottom:var(--space-5);}
          .co-success-sub{max-width:480px;margin:var(--space-3) auto var(--space-6);}
          .co-success-details{display:flex;flex-direction:column;gap:var(--space-3);margin:var(--space-6) 0;background:var(--color-cream);border-radius:var(--radius-md);padding:var(--space-5) var(--space-6);text-align:left;}
          .co-success-detail{display:flex;align-items:center;gap:var(--space-3);font-size:.9rem;color:var(--color-charcoal);}
          .co-success-actions{display:flex;gap:var(--space-3);justify-content:center;flex-wrap:wrap;}
        `}</style>
      </div>
    );
  }

  // ─── Main Page ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Hero ── */}
      <section className="co-hero">
        <div className="co-hero-bg" aria-hidden="true">
          <Image
            src="/images/artist-working.png"
            alt=""
            fill
            style={{ objectFit: "cover", objectPosition: "center top" }}
            priority
          />
        </div>
        <div className="container">
          <div className="co-hero-content animate-fadeInUp">
            <span className="co-hero-eyebrow">Bespoke Art Commissions</span>
            <h1 className="display-lg co-hero-h1">
              Commission Your Own <em>Masterpiece</em>
            </h1>
            <p className="co-hero-desc">
              Every piece Srilatha creates is made by hand, with intention. Commission a bespoke
              artwork designed entirely around your vision — your colours, your dimensions, your story.
            </p>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="section bg-cream">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow">The Process</span>
            <h2>How Custom Orders Work</h2>
            <p>A simple three-step journey from your idea to a finished masterpiece in your home.</p>
          </div>
          <div className="co-steps">
            {HOW_IT_WORKS.map(({ step, icon, title, desc }) => (
              <div key={step} className="process-step">
                <div className="process-step-number">{step}</div>
                <div className="co-step-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Form + Aside ── */}
      <section className="section">
        <div className="container">
          <div className="co-layout">

            {/* Form column */}
            <div className="co-form-col">
              <div className="co-form-header">
                <span className="eyebrow">Commission Form</span>
                <h2 className="display-sm">Tell Us About Your Vision</h2>
                <p className="text-body text-muted">
                  The more detail you share, the better we can bring your dream piece to life.
                  Fields marked <span style={{ color: "var(--color-terracotta)" }}>*</span> are required.
                </p>
              </div>

              <form onSubmit={handleSubmit} noValidate className="co-form">

                {/* Personal Details */}
                <fieldset className="co-fieldset">
                  <legend className="co-fieldset-legend">Personal Details</legend>
                  <div className="co-row">
                    <div className="form-group">
                      <label htmlFor="co-name" className="form-label">
                        Full Name <span style={{ color: "var(--color-terracotta)" }}>*</span>
                      </label>
                      <input
                        id="co-name"
                        name="name"
                        type="text"
                        className={`form-input${errors.name ? " co-input-err" : ""}`}
                        placeholder="e.g. Priya Sharma"
                        value={form.name}
                        onChange={handleChange}
                        autoComplete="name"
                      />
                      {errors.name && <span className="co-error">{errors.name}</span>}
                    </div>
                    <div className="form-group">
                      <label htmlFor="co-email" className="form-label">
                        Email Address <span style={{ color: "var(--color-terracotta)" }}>*</span>
                      </label>
                      <input
                        id="co-email"
                        name="email"
                        type="email"
                        className={`form-input${errors.email ? " co-input-err" : ""}`}
                        placeholder="you@example.com"
                        value={form.email}
                        onChange={handleChange}
                        autoComplete="email"
                      />
                      {errors.email && <span className="co-error">{errors.email}</span>}
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="co-phone" className="form-label">
                      Phone / WhatsApp <span style={{ color: "var(--color-terracotta)" }}>*</span>
                    </label>
                    <input
                      id="co-phone"
                      name="phone"
                      type="tel"
                      className={`form-input${errors.phone ? " co-input-err" : ""}`}
                      placeholder="+91 98765 43210"
                      value={form.phone}
                      onChange={handleChange}
                      autoComplete="tel"
                    />
                    {errors.phone && <span className="co-error">{errors.phone}</span>}
                    <span className="co-hint">We use this to send you progress updates via WhatsApp.</span>
                  </div>
                </fieldset>

                {/* Art Preferences */}
                <fieldset className="co-fieldset">
                  <legend className="co-fieldset-legend">Art Preferences</legend>
                  <div className="co-row">
                    <div className="form-group">
                      <label htmlFor="co-artType" className="form-label">
                        Art Type <span style={{ color: "var(--color-terracotta)" }}>*</span>
                      </label>
                      <select
                        id="co-artType"
                        name="artType"
                        className={`form-input form-select${errors.artType ? " co-input-err" : ""}`}
                        value={form.artType}
                        onChange={handleChange}
                      >
                        <option value="">— Select art type —</option>
                        <option value="Resin Art">🔮 Resin Art</option>
                        <option value="Lippan Art">🪞 Lippan Art</option>
                        <option value="Dot Mandala">🔵 Dot Mandala</option>
                        <option value="Kolam Art">🌸 Kolam Art</option>
                        <option value="Wedding Decor">💍 Wedding Decor</option>
                      </select>
                      {errors.artType && <span className="co-error">{errors.artType}</span>}
                    </div>
                    <div className="form-group">
                      <label htmlFor="co-budget" className="form-label">
                        Budget Range <span style={{ color: "var(--color-terracotta)" }}>*</span>
                      </label>
                      <select
                        id="co-budget"
                        name="budget"
                        className={`form-input form-select${errors.budget ? " co-input-err" : ""}`}
                        value={form.budget}
                        onChange={handleChange}
                      >
                        <option value="">— Select budget —</option>
                        <option value="Under ₹2000">Under ₹2,000</option>
                        <option value="₹2000-5000">₹2,000 – ₹5,000</option>
                        <option value="₹5000-10000">₹5,000 – ₹10,000</option>
                        <option value="Above ₹10000">Above ₹10,000</option>
                      </select>
                      {errors.budget && <span className="co-error">{errors.budget}</span>}
                    </div>
                  </div>
                  <div className="co-row">
                    <div className="form-group">
                      <label htmlFor="co-dimensions" className="form-label">Dimensions</label>
                      <input
                        id="co-dimensions"
                        name="dimensions"
                        type="text"
                        className="form-input"
                        placeholder="e.g. 30cm × 30cm, or A3 size"
                        value={form.dimensions}
                        onChange={handleChange}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="co-occasion" className="form-label">Occasion / Purpose</label>
                      <input
                        id="co-occasion"
                        name="occasion"
                        type="text"
                        className="form-input"
                        placeholder="e.g. Wedding gift, home décor, Diwali"
                        value={form.occasion}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="co-colors" className="form-label">Colour Preferences</label>
                    <input
                      id="co-colors"
                      name="colorPreferences"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Deep teal, gold and ivory; or earthy terracotta tones"
                      value={form.colorPreferences}
                      onChange={handleChange}
                    />
                  </div>
                </fieldset>

                {/* Your Vision */}
                <fieldset className="co-fieldset">
                  <legend className="co-fieldset-legend">Your Vision</legend>
                  <div className="form-group">
                    <label htmlFor="co-description" className="form-label">
                      Describe Your Vision <span style={{ color: "var(--color-terracotta)" }}>*</span>
                    </label>
                    <textarea
                      id="co-description"
                      name="description"
                      className={`form-input form-textarea${errors.description ? " co-input-err" : ""}`}
                      placeholder="Describe what you have in mind — the mood, style, any special details, who it's for and what story you'd like it to tell. The more you share, the better!"
                      rows={5}
                      value={form.description}
                      onChange={handleChange}
                    />
                    {errors.description && <span className="co-error">{errors.description}</span>}
                    <span className="co-hint">
                      {form.description.length} characters
                      {form.description.length > 0 && form.description.length < 30 && " — please add more detail"}
                    </span>
                  </div>
                  <div className="form-group">
                    <label htmlFor="co-refUrl" className="form-label">
                      Reference Image URL{" "}
                      <span className="text-muted" style={{ fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input
                      id="co-refUrl"
                      name="referenceUrl"
                      type="url"
                      className="form-input"
                      placeholder="https://pinterest.com/pin/... or any image link"
                      value={form.referenceUrl}
                      onChange={handleChange}
                    />
                    <span className="co-hint">Share a Pinterest, Instagram or any image link for visual reference.</span>
                  </div>
                </fieldset>

                {/* Terms */}
                <div className={`co-checkbox-group${errors.agreeTerms ? " co-checkbox-err" : ""}`}>
                  <label className="co-checkbox-label">
                    <input
                      type="checkbox"
                      name="agreeTerms"
                      checked={form.agreeTerms}
                      onChange={handleChange}
                      className="co-checkbox"
                    />
                    <span>
                      I understand that this is a custom commission request. By submitting I agree to the{" "}
                      <Link href="/policies/custom-orders" className="text-gold" style={{ textDecoration: "underline" }}>
                        Custom Order Terms
                      </Link>
                      , including the 50% non-refundable advance deposit policy.
                    </span>
                  </label>
                  {errors.agreeTerms && <span className="co-error">{errors.agreeTerms}</span>}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="btn btn-primary btn-lg btn-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="co-spinner" aria-hidden="true" />
                      Sending Your Request…
                    </>
                  ) : (
                    "✨ Submit Commission Request"
                  )}
                </button>
                <p className="co-form-note">
                  🔒 Your details are safe with us — we never share your information. Expect a reply within 24 hours.
                </p>
              </form>
            </div>

            {/* Aside */}
            <aside className="co-aside">
              {/* Direct WhatsApp */}
              <div className="co-aside-card co-aside-dark">
                <h3 className="co-aside-title" style={{ color: "var(--color-gold-light)" }}>
                  Prefer to Chat Directly?
                </h3>
                <p className="co-aside-desc" style={{ color: "rgba(255,255,255,0.75)" }}>
                  Skip the form and message Srilatha directly on WhatsApp to discuss your custom piece right away.
                </p>
                <a
                  href="https://wa.me/919876543210?text=Hi%20Srilatha!%20I'd%20like%20to%20commission%20a%20custom%20art%20piece."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-whatsapp btn-full"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  WhatsApp Srilatha
                </a>
              </div>

              {/* Trust badges */}
              <div className="co-aside-card">
                <h3 className="co-aside-title">Why Commission with Us?</h3>
                <ul className="co-trust-list">
                  {[
                    { icon: "🎨", text: "100% handcrafted — no prints, no mass production" },
                    { icon: "📸", text: "Progress photos shared at every stage" },
                    { icon: "🔄", text: "2 free design revisions included" },
                    { icon: "📦", text: "Securely packaged & insured shipping" },
                    { icon: "⭐", text: "200+ happy customers across India" },
                    { icon: "🤝", text: "Personal care from a solo artist" },
                  ].map(({ icon, text }) => (
                    <li key={text} className="co-trust-item">
                      <span className="co-trust-icon">{icon}</span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* FAQ */}
              <div className="co-aside-card">
                <h3 className="co-aside-title">Frequently Asked Questions</h3>
                <div className="co-faq-list">
                  {FAQ.map((item, i) => (
                    <div key={i} className={`co-faq-item${openFaq === i ? " co-faq-open" : ""}`}>
                      <button
                        type="button"
                        className="co-faq-q"
                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        aria-expanded={openFaq === i}
                      >
                        <span>{item.q}</span>
                        <span className="co-faq-chevron" aria-hidden="true">
                          {openFaq === i ? "−" : "+"}
                        </span>
                      </button>
                      {openFaq === i && (
                        <div className="co-faq-a animate-fadeIn">{item.a}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <style>{`
        .co-hero{position:relative;background:var(--color-ink);min-height:340px;display:flex;align-items:center;overflow:hidden;padding:var(--space-16) 0;}
        .co-hero-bg{position:absolute;inset:0;z-index:0;}
        .co-hero-bg::after{content:'';position:absolute;inset:0;background:linear-gradient(105deg,rgba(26,18,8,.9) 0%,rgba(26,18,8,.6) 55%,rgba(26,18,8,.3) 100%);}
        .co-hero .container{position:relative;z-index:1;}
        .co-hero-content{max-width:580px;}
        .co-hero-eyebrow{display:inline-flex;align-items:center;gap:var(--space-2);font-size:.7rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--color-gold-light);margin-bottom:var(--space-4);}
        .co-hero-eyebrow::before{content:'';display:block;width:32px;height:1px;background:var(--color-gold-light);}
        .co-hero-h1{color:#fff;margin-bottom:var(--space-4);}
        .co-hero-h1 em{font-style:italic;color:var(--color-gold-light);}
        .co-hero-desc{font-size:clamp(.95rem,2vw,1.1rem);line-height:1.7;color:rgba(255,255,255,.85);}
        .co-steps{display:grid;grid-template-columns:1fr;gap:var(--space-6);max-width:900px;margin:0 auto;}
        @media(min-width:640px){.co-steps{grid-template-columns:repeat(3,1fr);}}
        .co-step-icon{font-size:2rem;}
        .co-layout{display:grid;grid-template-columns:1fr;gap:var(--space-10);align-items:start;}
        @media(min-width:1024px){.co-layout{grid-template-columns:1fr 380px;}}
        .co-form-header{margin-bottom:var(--space-8);}
        .co-form-header .eyebrow{display:block;font-family:var(--font-body);font-size:.7rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--color-gold);margin-bottom:var(--space-3);}
        .co-form-header h2{margin-bottom:var(--space-3);}
        .co-form{display:flex;flex-direction:column;gap:var(--space-8);}
        .co-fieldset{border:none;padding:0;display:flex;flex-direction:column;gap:var(--space-5);}
        .co-fieldset-legend{font-family:var(--font-display);font-size:1rem;font-weight:600;color:var(--color-ink);margin-bottom:var(--space-4);padding-bottom:var(--space-3);border-bottom:1px solid var(--color-border);width:100%;}
        .co-row{display:grid;grid-template-columns:1fr;gap:var(--space-5);}
        @media(min-width:640px){.co-row{grid-template-columns:1fr 1fr;}}
        .co-input-err{border-color:var(--color-terracotta)!important;box-shadow:0 0 0 3px rgba(196,113,74,.12)!important;}
        .co-error{font-size:.78rem;color:var(--color-terracotta);font-weight:500;}
        .co-hint{font-size:.75rem;color:#7A6A50;}
        .co-checkbox-group{display:flex;flex-direction:column;gap:var(--space-2);}
        .co-checkbox-err{padding:var(--space-3);border-radius:var(--radius-md);border:1.5px solid var(--color-terracotta);background:rgba(196,113,74,.04);}
        .co-checkbox-label{display:flex;align-items:flex-start;gap:var(--space-3);font-size:.875rem;color:var(--color-charcoal);cursor:pointer;line-height:1.5;}
        .co-checkbox{width:18px;height:18px;flex-shrink:0;margin-top:2px;accent-color:var(--color-gold);cursor:pointer;}
        .co-form-note{font-size:.78rem;color:#7A6A50;text-align:center;margin-top:var(--space-2);}
        .co-spinner{width:16px;height:16px;border:2px solid rgba(26,18,8,.3);border-top-color:var(--color-ink);border-radius:50%;animation:co-spin .6s linear infinite;display:inline-block;}
        @keyframes co-spin{to{transform:rotate(360deg);}}
        .co-aside{display:flex;flex-direction:column;gap:var(--space-5);position:sticky;top:calc(var(--header-height) + var(--space-4));}
        .co-aside-card{background:#fff;border-radius:var(--radius-xl);padding:var(--space-6);border:1px solid var(--color-border);box-shadow:var(--shadow-sm);}
        .co-aside-dark{background:linear-gradient(135deg,var(--color-ink) 0%,#2D2010 100%);border-color:transparent;}
        .co-aside-title{font-family:var(--font-display);font-size:1rem;font-weight:600;color:var(--color-ink);margin-bottom:var(--space-3);}
        .co-aside-desc{font-size:.875rem;color:#7A6A50;line-height:1.6;margin-bottom:var(--space-5);}
        .co-trust-list{display:flex;flex-direction:column;gap:var(--space-3);}
        .co-trust-item{display:flex;align-items:center;gap:var(--space-3);font-size:.875rem;color:var(--color-charcoal);}
        .co-trust-icon{font-size:1.1rem;flex-shrink:0;width:28px;text-align:center;}
        .co-faq-list{display:flex;flex-direction:column;}
        .co-faq-item{border-bottom:1px solid var(--color-border);}
        .co-faq-item:last-child{border-bottom:none;}
        .co-faq-q{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);padding:var(--space-3) 0;font-size:.875rem;font-weight:600;color:var(--color-ink);background:none;border:none;width:100%;text-align:left;cursor:pointer;transition:color var(--duration-fast);}
        .co-faq-q:hover{color:var(--color-gold);}
        .co-faq-chevron{font-size:1.2rem;color:var(--color-gold);flex-shrink:0;font-weight:400;}
        .co-faq-a{font-size:.85rem;color:#7A6A50;line-height:1.65;padding-bottom:var(--space-4);}
      `}</style>
    </>
  );
}
