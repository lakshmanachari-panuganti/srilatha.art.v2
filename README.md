# Srilatha Art v2

> **Premium handmade Indian folk art e-commerce platform** — Resin Art, Lippan Art, Dot Mandala, Kolam Art, Wedding Decoratives & Gift Items. Ships pan-India in INR.

---

## 🏗️ Architecture

| Layer | Technology | Hosting |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) + Vanilla CSS | Vercel / Azure Static Web Apps |
| **Backend API** | Azure Functions (Node.js v4) | Azure Functions (Consumption plan) |
| **Database** | Azure Table Storage | Azure Storage Account |
| **Media** | Azure Blob Storage | Azure Storage Account |
| **Queue** | Azure Queue Storage | Azure Storage Account |
| **Secrets** | Azure Key Vault | Azure |
| **Monitoring** | Application Insights | Azure |
| **Payments** | Razorpay | SaaS |
| **WhatsApp** | WhatsApp Cloud API | Meta |
| **Email** | Azure Email Communication | Azure |

---

## 📁 Project Structure

```
srilatha.art.v2/
├── frontend/           # Next.js 14 customer storefront + admin panel
│   ├── app/            # App Router pages
│   │   ├── page.tsx              # Homepage
│   │   ├── shop/                 # Browse products
│   │   ├── product/[slug]/       # Product detail
│   │   ├── cart/                 # Cart page
│   │   ├── checkout/             # Checkout flow
│   │   ├── order-confirmation/   # Success page
│   │   ├── custom-order/         # Custom commission request
│   │   ├── account/              # Customer dashboard
│   │   ├── login/                # Auth pages
│   │   ├── sale/                 # Sale page
│   │   ├── about/                # About / Our Story
│   │   ├── contact/              # Contact
│   │   ├── faq/                  # FAQ
│   │   ├── care-guide/           # Care Guide
│   │   ├── shipping-returns/     # Shipping & Returns
│   │   └── admin/                # Admin panel
│   ├── components/     # Reusable UI components
│   ├── lib/            # Data, utils, API client
│   └── public/images/  # AI-generated artwork images
│
├── backend/            # Azure Functions API
│   └── src/functions/  # HTTP + Queue + Timer triggers
│
├── setup.ps1           # One-click setup script
└── Ai-instructions/    # Original specifications
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 24
- Azure Functions Core Tools v4
- PowerShell 7+

### 1. Run Setup Script
```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1
```

This will:
- Copy AI-generated images to `frontend/public/images/`
- Install frontend npm dependencies
- Create `.env.local` template
- Start the dev server at **http://localhost:3000**

### 2. Configure Environment Variables

Edit `frontend/.env.local` with your actual values:

```env
# Azure AD (MY_APPREG_*)
AZURE_CLIENT_ID=your_client_id
AZURE_CLIENT_SECRET=your_client_secret
AZURE_TENANT_ID=your_tenant_id

# Razorpay
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

# WhatsApp Cloud API
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_WABA_ID=...
```

### 3. Start Frontend Only (no backend needed for UI)
```bash
cd frontend
npm install
npm run dev
```

### 4. Start Backend (requires Azure Storage Emulator)
```bash
cd backend
npm install
npm run dev
```

---

## 🎨 Design System

- **Fonts**: Inter (display + body, weights 300–900) · Playfair Display (italic accents, 400–800)
- **Aesthetic**: Dark premium · gradient accents · glowing blue CTAs
- **Mobile-First**: All layouts designed for 375px first

### Colour tokens (`frontend/app/globals.css`)
| Token | Hex | Use |
|---|---|---|
| `--bg-base` | `#090B10` | Page background |
| `--bg-surface` | `#0D1018` | Section background |
| `--bg-card` | `#111520` | Card surface |
| `--bg-elevated` | `#1A2030` | Elevated form / input |
| `--accent-blue` | `#00A3FF` | Primary CTA · brand primary (also Razorpay theme) |
| `--accent-green` | `#00E676` | Success / availability |
| `--accent-purple` | `#7B61FF` | Tertiary gradient stop |
| `--accent-gold` | `#FFB800` | Ratings · highlights |
| `--accent-teal` | `#00C9B8` | Secondary accent |
| `--text-primary` | `#FFFFFF` | Body text |
| `--text-secondary` | `rgba(255,255,255,0.6)` | Sub-text |

### Signature gradient
`--gradient-brand: linear-gradient(135deg, #00E676 0%, #00A3FF 50%, #7B61FF 100%)` — used on brand wordmarks, prices and section accents.

### Contact (single source of truth)
`frontend/lib/contact.ts` — WhatsApp `+91 90523 80325`, email `studio@srilatha.art`, studio at Chilkanagar, Uppal, Hyderabad.

---

## 📱 Pages

### Storefront
| Route | Description |
|---|---|
| `/` | Homepage |
| `/shop` | Browse all artworks with filter/sort |
| `/product/[slug]` | Product detail with gallery, reviews |
| `/cart` | Full cart page |
| `/checkout` | Address + Razorpay payment (server-side validated) |
| `/order-success` | Razorpay redirect target |
| `/custom-order` | Commission a bespoke piece |
| `/sale` | Items currently on sale |
| `/account` | Customer profile |
| `/account/orders` | Order history & tracking |
| `/account/wishlist` | Saved items |
| `/account/settings` | Account settings |
| `/login` | Google OAuth sign-in |

### Info / Policy
| Route | Description |
|---|---|
| `/about` | Artist story + studio address |
| `/contact` | WhatsApp, email, Instagram, studio address |
| `/faq` | Sections: Orders, Returns, Custom, Care, Payments |
| `/care-guide` | Care instructions per art type |
| `/shipping-returns` | Pan-India shipping + 7-day returns |
| `/policies/custom-orders` | Custom-order terms (50% advance, revisions, etc.) |
| `/privacy-policy` | Privacy policy |
| `/terms` | Terms of service |

### Admin
| Route | Description |
|---|---|
| `/admin` | Login |
| `/admin/setup` | First-time bootstrap (requires `ADMIN_SETUP_TOKEN`) |
| `/admin/dashboard` | KPIs (revenue, orders, low-stock, pending reviews) |
| `/admin/products` · `/new` · `/edit?id=` | Product CRUD |
| `/admin/orders` · `/detail?id=` | List, filter, search, bulk status, detail with tracking + notes |
| `/admin/custom-orders` | Inbox + status + admin notes |
| `/admin/coupons` | Coupon CRUD with redemption tracking |
| `/admin/announcements` | Schedule + priority |
| `/admin/reviews` | Approve / reject moderation queue |
| `/admin/whatsapp` · `/conversation?phone=` | Conversation viewer |
| `/admin/settings` | Admin profile |

---

## 🔐 Admin Panel

Auth is **email + password** with bcrypt hashes stored in the `admins` Table and JWT sessions.

### First-time setup
1. Set `ADMIN_SETUP_TOKEN=<random-secret>` in the Azure Function App env.
2. Open `/admin/setup` and fill in name, email, password (10+ chars) and the setup token.
3. The setup endpoint is locked once the first admin exists.

### Subsequent admins
Add directly via the `admins` storage Table (admin UI for managing other admins ships in a future release).

### Features
Dashboard · Product CRUD · Order management (status / notes / tracking / bulk) · Custom Orders inbox · Coupons CRUD · Announcements (scheduled) · Review moderation · WhatsApp conversation viewer.

---

## 💰 Cost Estimate (Azure)

| Service | Monthly Cost |
|---|---|
| Azure Functions (Consumption) | Free up to 1M req |
| Azure Storage (Table + Blob + Queue) | ~₹150-300/month |
| Azure Key Vault | ~₹20/month |
| Application Insights | Free 5GB/month |
| **Total** | **~₹170-320/month** |

*Razorpay: 2% per transaction. WhatsApp: per-message billing applies.*
