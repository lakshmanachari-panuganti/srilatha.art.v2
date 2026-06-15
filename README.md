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
- Node.js 18+
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

- **Primary Font**: Playfair Display (headings) + Inter (body)
- **Colors**: Gold `#C9A84C` · Ink `#1A1208` · Cream `#FDF8F0`
- **Mobile-First**: All layouts designed for 375px first
- **Aesthetic**: Warm, premium, handcrafted

---

## 📱 Pages

| Route | Description |
|---|---|
| `/` | Homepage with hero, collections, best sellers |
| `/shop` | Browse all artworks with filter/sort |
| `/product/[slug]` | Product detail with gallery, reviews |
| `/cart` | Cart with coupon codes |
| `/checkout` | Address + Razorpay payment |
| `/custom-order` | Commission a bespoke piece |
| `/account` | Customer dashboard |
| `/account/orders` | Order history & tracking |
| `/account/wishlist` | Saved items |
| `/sale` | Current offers & coupons |
| `/about` | Our story |
| `/contact` | Get in touch |
| `/faq` | Frequently asked questions |
| `/care-guide` | Art care instructions |
| `/shipping-returns` | Policies |
| `/admin` | Admin panel (protected) |

---

## 🔐 Admin Panel

Access at `/admin` with:
- **Username**: admin
- **Password**: srilatha2025 *(change via env var before production)*

Features: Dashboard, Product CRUD + AI content generation, Order management, Coupons, Announcements, Review moderation, WhatsApp conversations.

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
