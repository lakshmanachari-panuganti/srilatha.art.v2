# Srilatha Art v2 — Project Wiki

A single, current reference for everything required to understand, run, deploy,
and operate the Srilatha Art storefront. Read top-to-bottom for onboarding; jump
via the table of contents for ops or debugging.

> **Companion docs:** [README.md](README.md) (quick start), the
> [improvements_needed/](improvements_needed/) backlog, and the per-script
> comment blocks in [infra/](infra/) for command-line reference.

---

## Table of contents

1. [Overview](#1-overview)
2. [System architecture](#2-system-architecture)
3. [Repository layout](#3-repository-layout)
4. [Frontend](#4-frontend)
5. [Backend](#5-backend)
6. [Data model (Azure Table Storage)](#6-data-model-azure-table-storage)
7. [Authentication & authorization](#7-authentication--authorization)
8. [Payments (Razorpay)](#8-payments-razorpay)
9. [Messaging (WhatsApp + email)](#9-messaging-whatsapp--email)
10. [Environments & Azure resources](#10-environments--azure-resources)
11. [Configuration reference](#11-configuration-reference)
12. [CI/CD — GitHub Actions workflows](#12-cicd--github-actions-workflows)
13. [Post-deployment validation](#13-post-deployment-validation)
14. [Local development](#14-local-development)
15. [Testing](#15-testing)
16. [Operational runbooks](#16-operational-runbooks)
17. [Conventions](#17-conventions)
18. [Troubleshooting](#18-troubleshooting)
19. [Roadmap / backlog](#19-roadmap--backlog)

---

## 1. Overview

**Srilatha Art** is a single-artist, made-to-order Indian handicraft storefront
shipping pan-India. The platform supports:

- **Catalog** — Resin Art, Lippan Art, Dot Mandala, Kolam Art, Wedding Decor,
  Gift Sets (six top-level categories managed via the admin portal).
- **Commerce** — variable inventory, coupons, free-shipping threshold, INR-only,
  Razorpay-hosted checkout.
- **Custom orders** — brief-submission form for bespoke commissions, moderated
  via the admin portal.
- **Customer accounts** — email/password + Google OAuth + WhatsApp-OTP password
  reset.
- **Reviews** — verified-buyer only, pending admin moderation before going
  public.
- **Admin portal** — JWT-protected back office for products, orders, custom
  orders, coupons, announcements, reviews, WhatsApp threads, and stats.

This is a small, founder-operated business: optimised for low operational
overhead, clear audit trails, and recoverable Azure infrastructure rather than
horizontal scale.

### Stack at a glance

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | Next.js 15 (App Router, `output: 'export'`) + React 18 + vanilla CSS | Azure Static Web Apps |
| Backend | Azure Functions v4 (Node.js 22, TypeScript) | Azure Functions Consumption plan |
| Database | Azure Table Storage | Azure Storage Account |
| Media | Azure Blob Storage (products container) | Azure Storage Account |
| Auth | JWT (HS256) — separate customer & admin tokens | In-process |
| Payments | Razorpay (test on DEV, live on PRD) | SaaS |
| Messaging | WhatsApp Cloud API (Meta) + SMTP email | SaaS |
| Secrets | Azure Key Vault (backups), Function App settings (runtime) | Azure |
| CI/CD | GitHub Actions (OIDC → Azure) | GitHub-hosted runners |
| Validation | Headless Chromium (Playwright) + axe-core | GitHub Actions |

---

## 2. System architecture

```
                                ┌──────────────────────────┐
                                │     Customer browser     │
                                └───────────┬──────────────┘
                                            │ HTTPS
                                            ▼
        ┌──────────────────────── Azure Static Web Apps ───────────────────────────┐
        │  Next.js export (static HTML + JS)                                       │
        │  • /, /shop, /product/[slug], /cart, /checkout, /account, /admin, …      │
        │  • not-found.tsx — themed 404 + client-side product fallback             │
        │  • RuntimeConfigProvider fetches /api/config/public on mount             │
        └─────────────────┬───────────────────────────────┬────────────────────────┘
                          │ /api/*                        │ images
                          ▼                               ▼
        ┌──── Azure Functions ────┐         ┌──── Azure Blob Storage ────┐
        │ Public routes:          │         │ products container          │
        │  /products, /orders,    │         │  • /seed/<file>.png         │
        │  /auth/*, /reviews,     │         │  • per-product image dirs   │
        │  /coupons, /announc.,   │         └─────────────────────────────┘
        │  /custom-orders,        │
        │  /config/public,        │
        │  /razorpay/webhook,     │
        │  /whatsapp/send         │         ┌──── Azure Table Storage ────┐
        │                         │◀───────▶│ products, orders, orderItems│
        │ Admin routes (/mgmt/*): │         │ customers, customerPhoneIndex│
        │  products, orders,      │         │ admins, reviews, coupons,   │
        │  customOrders, coupons, │         │ couponRedemptions, custom-  │
        │  announcements, reviews,│         │ Orders, orderEvents, config,│
        │  whatsapp, stats        │         │ loginAudit, passwordReset-  │
        │                         │         │ Audit                       │
        └──────────┬──────────────┘         └─────────────────────────────┘
                   │                                ▲          ▲
                   │ outbound                       │          │
                   ▼                                │          │
    ┌──── Razorpay ────┐  ┌─── WhatsApp ───┐  ┌── SMTP ──┐    │
    │ orders.create    │  │ Cloud API      │  │ Email    │    │
    │ webhook callback │  │ (Meta)         │  │ (any TLS)│────┘
    │ payment.captured │  │ OTP + receipts │  │ receipts │
    └──────────────────┘  └────────────────┘  └──────────┘
```

### Request lifecycle examples

**Browsing the catalog**

1. Browser hits SWA → static HTML loads.
2. Client `useEffect` calls `GET /api/products?limit=100`.
3. Function App reads `products` Table partition, returns JSON.
4. `ProductCard` images load from blob storage.

**Placing an order**

1. Customer clicks "Pay" on `/checkout`.
2. Frontend `POST /api/orders` with cart items + customer + address +
   optional coupon.
3. Function App calculates totals server-side (it never trusts the client),
   validates coupon, calls `https://api.razorpay.com/v1/orders`, stores order
   with `partitionKey='pending'`.
4. Frontend opens Razorpay's hosted checkout iframe with the server-issued
   `order_id`.
5. After payment, Razorpay invokes the **success handler** in the browser AND
   the **`/api/razorpay/webhook` server endpoint**.
6. The browser calls `POST /api/orders/{orderId}/verify-payment` which checks
   the HMAC signature; on success the order moves to `partitionKey='confirmed'`,
   the customer is redirected to `/order-success`, and an order email is sent.

---

## 3. Repository layout

```
srilatha.art.v2/
├── frontend/                   # Next.js 15 customer storefront + admin
│   ├── app/                    # App Router pages
│   │   ├── layout.tsx          # Root — providers, fonts, metadata
│   │   ├── page.tsx            # Home (delegates to HomeClient)
│   │   ├── HomeClient.tsx      # Hero, collections, journeys, newsletter
│   │   ├── not-found.tsx       # Themed 404 + product fallback
│   │   ├── shop/               # Catalog list w/ category filter
│   │   ├── product/[slug]/     # Product detail (SSG + runtime fallback)
│   │   ├── cart/               # Cart page
│   │   ├── checkout/           # 3-step Razorpay checkout
│   │   ├── order-success/      # Post-payment receipt
│   │   ├── custom-order/       # Bespoke commission brief
│   │   ├── account/            # Customer dashboard
│   │   ├── login/              # Standalone login page (also via modal)
│   │   ├── admin/              # JWT-gated back office
│   │   ├── about, contact, care-guide, faq, policies/, privacy-policy,
│   │   │   sale, shipping-returns, terms
│   ├── components/
│   │   ├── auth/   {AuthProvider, AuthModal, AccountShell}
│   │   ├── cart/   {CartProvider, CartDrawer}
│   │   ├── layout/ {Header, Footer, AnnouncementBar, WhatsAppFloat}
│   │   ├── shop/   {ProductCard, ProductDetailLayout, ProductReviews}
│   │   ├── runtime/{RuntimeConfigProvider, GoogleAuthGate}
│   │   ├── admin/  {AdminShell, AdminAuthProvider, ProductForm, …}
│   │   └── ui/     {Toaster, NewsletterForm, PageHeader, Prose}
│   ├── lib/        {api.ts, data.ts, assets.ts, contact.ts, categoryIcons.ts}
│   ├── public/     {og-image, favicons}   # built artefacts in `out/`
│   ├── app/globals.css                    # The full vanilla design system
│   ├── next.config.ts                     # output:'export', image patterns
│   └── staticwebapp.config.json           # SWA fallback rewrite to /404.html
│
├── backend/                    # Azure Functions v4 (TypeScript)
│   ├── src/
│   │   ├── index.ts            # entry — registers every function
│   │   ├── functions/          # 22 HTTP triggers (see §5 catalog)
│   │   ├── middleware/adminGuard.ts   # JWT admin guard
│   │   ├── services/aiContentGenerator.ts
│   │   ├── templates/whatsappTemplates.ts
│   │   └── utils/
│   │       ├── tableStorage.ts     # upsert / query / get / delete helpers
│   │       ├── blobStorage.ts
│   │       ├── customerStore.ts    # customer entity + phone-index
│   │       ├── auditLog.ts         # loginAudit + passwordResetAudit
│   │       ├── email.ts            # SMTP send + honest result reporting
│   │       └── identifiers.ts      # phone/email normalisers
│   ├── host.json
│   └── tsconfig.json
│
├── tests/
│   ├── auth.spec.ts            # local Playwright e2e (mocked API)
│   ├── ui-truthfulness.spec.ts # OTP / order-success copy honesty
│   ├── ux-review.spec.ts       # full page captures, live URL
│   ├── ux-home-sections.spec.ts # scrolled section captures
│   ├── ux-polish.spec.ts       # narrow before/after polish captures
│   └── post-deploy/            # post-deployment validation suite (CI)
│       ├── run-validation.mjs
│       ├── generate-report.mjs # HTML report
│       ├── write-summary.mjs   # markdown for $GITHUB_STEP_SUMMARY
│       └── package.json
│
├── infra/                      # PowerShell ops scripts
│   ├── Azure-Connectivity.ps1  # SP login → Az session
│   ├── Deploy-Infrastructure-v2.ps1
│   ├── Deploy-Frontend.ps1, Deploy-Backend.ps1
│   ├── Backup-function-settings-v2.ps1   # → Key Vault snapshot
│   ├── Restore-function-settings-v2.ps1  # ← Key Vault snapshot
│   ├── Update-AppSettings-v2.ps1         # SMTP, WhatsApp, GOOGLE_CLIENT_ID, …
│   ├── Rotate-RazorpayApiKeys-v2.ps1
│   ├── Rotate-RazorpayWebhookSecret-v2.ps1
│   ├── seed-admin.ps1
│   ├── Send-WhatsAppOrderConfirmation.ps1
│   └── Audit-Wiring.ps1        # cross-resource sanity audit
│
├── .github/workflows/
│   ├── deploy-frontend-dev.yml, deploy-frontend-prd.yml
│   ├── deploy-backend-dev.yml,  deploy-backend-prd.yml
│   ├── validate-dev.yml, validate-prd.yml, validation-shared.yml
│
├── Developers-Handoff/         # Snapshot transcripts (autonomous-agent telemetry)
├── Ai-instructions/            # Original spec markdown
├── improvements_needed/        # Backlog of deferred fixes
├── playwright.config.ts        # Local-dev Playwright (auth.spec.ts)
├── playwright.live.config.ts   # Live-URL Playwright (ux-*.spec.ts)
├── README.md, AGENTS.md, wiki.md (this file)
├── setup.ps1, start-dev.bat, push.bat
└── package.json (root) — only `@playwright/test`
```

---

## 4. Frontend

**Framework:** Next.js 15 App Router, statically exported (`output: 'export'`)
and deployed to Azure Static Web Apps. No SSR at runtime — every page is
generated at build time, every dynamic page is hydrated client-side.

### 4.1 Provider tree

`frontend/app/layout.tsx` wraps the entire app in this order:

```
<html><body>
  <RuntimeConfigProvider>      ← fetches /api/config/public on mount
    <GoogleAuthGate>            ← re-keys GoogleOAuthProvider on cfg load
      <AuthProvider>            ← customer JWT in localStorage
        <AdminAuthProvider>     ← separate admin JWT
          <CartProvider>        ← cart in localStorage (key: srilatha_cart)
            <AnnouncementBar/>
            <Header/>
            <main>{children}</main>
            <Footer/>
            <WhatsAppFloat/>    ← draggable FAB, position persisted
```

### 4.2 Runtime configuration

The Google OAuth Client ID is fetched at runtime via `GET /api/config/public`
rather than baked into the static bundle. This lets the operator rotate the
client ID via the Function App's Application Settings without rebuilding the
frontend. See [`RuntimeConfigProvider`](frontend/components/runtime/RuntimeConfigProvider.tsx)
and [`GoogleAuthGate`](frontend/components/runtime/GoogleAuthGate.tsx).

### 4.3 Static export & dynamic routes

- `generateStaticParams()` on `/product/[slug]/page.tsx` enumerates the slugs
  it knows about at build time.
- For slugs created **after** the most recent deploy, SWA falls through to
  `/404.html` (built from `app/not-found.tsx`), whose client component detects
  the `/product/<slug>` path, re-fetches via `GET /api/products/{slug}`, and
  renders the same UI client-side. Result: new admin-created products work
  immediately without a redeploy.
- If the API is unreachable at build time, `generateStaticParams()` returns a
  single sentinel slug (`__placeholder`) so the build still passes; every
  real request then falls through to the not-found client fetcher.

### 4.4 Design system

`frontend/app/globals.css` defines a dark, glow-blue design language with
custom properties (`--bg-base`, `--accent-blue`, `--gradient-brand`, `--sp-*`,
`--r-*`, `--glow-blue-*`). The system uses Inter at adjusted weights (700–800,
not the default 900) with tighter leading. Section padding rhythm is tuned
to ~80–100px on desktop / 40–56px on mobile.

### 4.5 Asset loading

Images come from Azure Blob via `NEXT_PUBLIC_ASSET_BASE_URL`. The helper
`seedImg(filename)` in `lib/assets.ts` returns either the blob URL or a
1×1 transparent SVG placeholder when the env var is unset.

---

## 5. Backend

**Runtime:** Azure Functions v4 host, Node.js 22, TypeScript compiled to
`backend/dist/`. All routes are HTTP triggers; entry point
[`backend/src/index.ts`](backend/src/index.ts) imports each module so its
`app.http(...)` registration fires.

### 5.1 HTTP route catalog

#### Public routes

| Method | Path | Function | Purpose |
|---|---|---|---|
| GET | `/api/products` | `listProducts` | Catalog list (filtered) |
| GET | `/api/products/{slug}` | `getProductBySlug` | Single product |
| GET | `/api/announcements` | `getPublicAnnouncements` | Active banners |
| GET | `/api/coupons/active` | `activeCoupons` | Public coupon set |
| POST | `/api/coupons/validate` | `validateCoupon` | UX preview of discount |
| GET | `/api/config/public` | `getPublicConfig` | Returns `googleClientId` |
| GET | `/api/reviews?productId=…` | `listPublicReviews` | Approved reviews only |
| POST | `/api/reviews` | `submitReview` | Verified-buyer only |
| POST | `/api/custom-orders` | `customOrdersPost` | Bespoke commission brief |
| GET | `/api/custom-orders` | `customOrdersGet` | Customer's brief lookup |
| POST | `/api/auth/register` | `customerRegister` | Email/password signup |
| POST | `/api/auth/login` | `customerLogin` | Identifier (email \|\| phone) + password |
| POST | `/api/auth/google` | `customerGoogleAuth` | Google access-token exchange |
| POST | `/api/auth/forgot-password/request` | `forgotPasswordRequest` | WA-OTP issue |
| POST | `/api/auth/forgot-password/verify` | `forgotPasswordVerify` | OTP → reset token |
| POST | `/api/auth/forgot-password/reset` | `forgotPasswordReset` | New password + sign in |
| POST | `/api/orders` | `createOrder` | Cart → Razorpay order |
| GET | `/api/orders/{orderId}` | `getOrder` | (JWT) order detail |
| POST | `/api/orders/{orderId}/verify-payment` | `verifyPayment` | HMAC check + confirm |
| POST | `/api/razorpay/webhook` | `razorpayWebhook` | Razorpay → us |
| POST | `/api/whatsapp/send` | `whatsappSend` | Outbound WhatsApp (admin only via guard) |

#### Admin routes (all under `/api/mgmt/*`, JWT-gated)

| Method | Path | Function |
|---|---|---|
| POST | `/mgmt/setup` | `adminSetup` — first-run bootstrap |
| POST | `/mgmt/login` | `adminLogin` |
| POST | `/mgmt/logout` | `adminLogout` |
| GET | `/mgmt/stats` | `adminGetStats` |
| GET, POST | `/mgmt/announcements` | list / create |
| PATCH, DELETE | `/mgmt/announcements/{id}` | update / delete |
| GET, POST | `/mgmt/coupons` | list / create |
| PATCH, DELETE | `/mgmt/coupons/{code}` | update / delete |
| GET | `/mgmt/coupons/{code}/redemptions` | usage |
| GET, POST | `/mgmt/products` | list / create |
| PATCH, DELETE | `/mgmt/products/{id}` | update / delete |
| POST | `/mgmt/products/ai-generate` | OpenAI-backed copy generation |
| POST | `/mgmt/products/ai-generate-upload` | Same with image upload |
| GET | `/mgmt/orders` | list (filterable) |
| GET | `/mgmt/orders/{id}` | detail |
| PATCH | `/mgmt/orders/{id}/status` | status transition |
| POST | `/mgmt/orders/{id}/notes` | append note |
| POST | `/mgmt/orders/bulk-status` | bulk transition |
| GET | `/mgmt/custom-orders` | list briefs |
| PATCH | `/mgmt/custom-orders/{id}` | update brief |
| GET | `/mgmt/reviews?status=…` | pending / approved / rejected |
| PATCH, POST | `/mgmt/reviews/{id}/{action}` | approve / reject (recomputes product rating) |
| POST | `/mgmt/upload` | Blob upload helper |
| GET | `/mgmt/whatsapp/conversations` | inbox |
| GET | `/mgmt/whatsapp/conversations/{phone}` | thread |

### 5.2 Cross-cutting concerns

- **CORS** — every handler returns `Access-Control-Allow-Origin: *` plus
  matching methods/headers. OPTIONS lives on the first handler per route.
- **Server is the source of truth for money** — `createOrder` recomputes
  subtotal, shipping, discount from product prices and coupon rules; never
  trusts the client-sent amount.
- **HMAC signature verification** on Razorpay webhook + verify-payment.
- **Audit logs** — every login attempt and password-reset action writes to
  `loginAudit` / `passwordResetAudit` partitioned by user id.

---

## 6. Data model (Azure Table Storage)

A single storage account holds all tables. Each row uses
`partitionKey` + `rowKey` as the composite primary key.

| Table | PartitionKey | RowKey | Purpose |
|---|---|---|---|
| `products` | category | productId | Catalog. Updated by admin; `rating`/`reviewCount` recomputed on review approval. |
| `orders` | status (`pending` / `confirmed` / `shipped` / `delivered` / `cancelled`) | orderId (`ORD-<ms>`) | One row per order. Status transitions move the row across partitions. |
| `orderItems` | orderId | `<productId>-<index>` | Line items snapshot at order time. |
| `orderEvents` | orderId | uuid | Status-change + note audit. |
| `customers` | `'customer'` | email (lower-cased) | Customer master. |
| `customerPhoneIndex` | `'phone'` | E.164 phone | Email-by-phone lookup. |
| `admins` | `'admin'` | email | Admin master, bcrypt'd password. |
| `reviews` | `pending` / `approved` / `rejected` | reviewId | Moderated reviews; approved partition is what `/api/reviews` returns. |
| `coupons` | `'coupon'` | code (upper-cased) | Discount rules. |
| `couponRedemptions` | code | orderId | Usage log. |
| `customOrders` | status (`new` / `in_review` / `quoted` / `in_progress` / `completed` / `declined`) | briefId | Custom commission briefs. |
| `config` | `'announcement'` etc. | uuid | Banner/announcement records. |
| `loginAudit` | userId | uuid | Per-attempt login record. |
| `passwordResetAudit` | normalised phone | uuid | OTP request / verify / reset trail. |

### Why partition-by-status

Status changes are infrequent and queries are always either "all in status X"
(admin dashboards) or "specific orderId regardless of status" (the order
detail). Partitioning by status keeps "all pending" / "all delivered" reads
cheap, and the few cross-partition lookups iterate the small status set.

---

## 7. Authentication & authorization

Two completely separate JWT identities. Both signed with the same
`JWT_SECRET` but distinguished by claims and never interchangeable in code.

### 7.1 Customer JWT

Issued by `/api/auth/register`, `/api/auth/login`, `/api/auth/google`,
`/api/auth/forgot-password/reset`. Stored in `localStorage` under
`google_auth_token` (historic name; works for all customer auth methods).

Claims: `{ sub, email, name, picture?, mobile?, iat, exp }` — 30-day TTL.

### 7.2 Admin JWT

Issued by `/mgmt/login` (via the `/admin` portal). Stored under a separate
key. Guarded by [`middleware/adminGuard.ts`](backend/src/middleware/adminGuard.ts)
which accepts role values `admin`, `super_admin`, or `superadmin`.

### 7.3 Password reset

WhatsApp Cloud API delivers a 6-digit OTP to the customer's verified phone.
Backend audits every step. The frontend's success copy is **honest about
delivery**: it claims WhatsApp delivery only when the backend confirmed it,
otherwise neutral wording (see `auth/AuthModal.tsx`).

### 7.4 Google OAuth

`NEXT_PUBLIC_GOOGLE_CLIENT_ID` is **not** used. The client ID is read at
runtime from `/api/config/public`, populated by the Function App's
`GOOGLE_CLIENT_ID` setting. This means rotation is a single
`./infra/Update-AppSettings-v2.ps1 -GoogleClientId …` call — no rebuild.

---

## 8. Payments (Razorpay)

### 8.1 Flow

1. `POST /api/orders` — server creates a Razorpay order with the *server-
   computed* total in paise, persists the local order in `pending`.
2. Frontend opens the Razorpay hosted modal with the returned `razorpay_order_id`.
3. Customer pays. Razorpay's success handler invokes
   `POST /api/orders/{orderId}/verify-payment` with `razorpay_order_id`,
   `razorpay_payment_id`, `razorpay_signature`.
4. Server verifies the HMAC signature using `RAZORPAY_KEY_SECRET`, moves the
   order to `confirmed`, sends the order email, redirects the customer to
   `/order-success`.
5. In parallel, Razorpay calls `/api/razorpay/webhook` for the same payment
   event — a belt-and-braces signal verified with `RAZORPAY_WEBHOOK_SECRET`.

### 8.2 Test mode

DEV uses Razorpay TEST keys. The test card published in the post-deploy
validation runner (`5104 0600 0000 0008`) is the
[Razorpay-published sandbox card](https://razorpay.com/docs/payments/payments/test-card-details/).

### 8.3 Rotation

Use [`infra/Rotate-RazorpayApiKeys-v2.ps1`](infra/Rotate-RazorpayApiKeys-v2.ps1)
and [`infra/Rotate-RazorpayWebhookSecret-v2.ps1`](infra/Rotate-RazorpayWebhookSecret-v2.ps1)
— both take pre- and post-update Key Vault backups before the swap.

---

## 9. Messaging (WhatsApp + email)

### 9.1 WhatsApp Cloud API

- Outbound only (transactional). No webhook ingress is wired yet.
- Templates live in
  [`backend/src/templates/whatsappTemplates.ts`](backend/src/templates/whatsappTemplates.ts).
- Notable templates: `password_reset_otp`, `order_confirmation`,
  `order_shipped`, `review_request`.

### 9.2 Email

Generic SMTP via `nodemailer`. Env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`, `SMTP_SECURE`, `SMTP_SENDER_EMAIL`, `SMTP_SENDER_NAME`,
`SMTP_REPLY_TO`. The order-success page surfaces the **actual send result**
returned by the backend, never claiming an email went out when it didn't.

---

## 10. Environments & Azure resources

Two environments, never share resources.

| Concept | DEV | PRD |
|---|---|---|
| Branch | `develop` | `main` |
| Resource group | `rg-srilathaartv2-dev` | `rg-srilathaartv2-prd` |
| Function App | `func-srilathaartv2-dev` | `func-srilathaartv2-prd` |
| Storage account | `stsrilathaartv2dev` | `stsrilathaartv2prd` |
| Key Vault | `kv-srilathaartv2-dev` | `kv-srilathaartv2-prd` |
| Static Web App URL | `orange-forest-042a5df00.7.azurestaticapps.net` | `www.srilatha.art` |
| Function URL | `func-srilathaartv2-dev.azurewebsites.net/api` | `func-srilathaartv2-prd.azurewebsites.net/api` |
| Blob container | `stsrilathaartv2dev/products` | `stsrilathaartv2prd/products` |
| Razorpay | Test keys (`rzp_test_*`) | Live keys (`rzp_live_*`) |
| GitHub `environment:` | _(none)_ | `production` (approval gate) |
| Auth flow in CI | Azure OIDC via `secrets.AZURE_CLIENT_ID_DEV` | `secrets.AZURE_CLIENT_ID_PRD` |

Tenant + subscription are shared: `secrets.AZURE_TENANT_ID`,
`secrets.AZURE_SUBSCRIPTION_ID`.

---

## 11. Configuration reference

### 11.1 Frontend env vars (build-time)

| Var | Set in | Used by | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `.env.local` / deploy workflow | `lib/api.ts` | Falls back to `NEXT_PUBLIC_API_URL`, then `http://localhost:7071/api`. |
| `NEXT_PUBLIC_API_URL` | `.env.local` | `lib/api.ts` | Legacy alias for `NEXT_PUBLIC_API_BASE_URL`. |
| `NEXT_PUBLIC_ASSET_BASE_URL` | deploy workflow | `lib/assets.ts`, `next.config.ts` (image remote-pattern) | Per-env blob host. Required at build time. |
| `NEXT_PUBLIC_SITE_URL` | deploy workflow | metadata, OG | Canonical domain. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | deploy workflow (fetched from Function App at build time) | Razorpay modal | `rzp_test_*` on DEV, `rzp_live_*` on PRD. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | _no longer used_ | _none_ | Replaced by runtime `/api/config/public`. |

### 11.2 Backend Function App settings

| Setting | Purpose | Where to rotate |
|---|---|---|
| `AZURE_STORAGE_CONNECTION_STRING` | Storage account access | Function App settings (manual) |
| `JWT_SECRET` | Sign customer + admin tokens | Function App settings (one-off bootstrap) |
| `ADMIN_SECRET` | One-shot signup token for `mgmt/setup` | Function App settings |
| `ADMIN_SETUP_TOKEN` | Pairs with `ADMIN_SECRET` | Function App settings |
| `RAZORPAY_KEY_ID` | Razorpay client | `Rotate-RazorpayApiKeys-v2.ps1` |
| `RAZORPAY_KEY_SECRET` | Razorpay secret | `Rotate-RazorpayApiKeys-v2.ps1` |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook HMAC | `Rotate-RazorpayWebhookSecret-v2.ps1` |
| `GOOGLE_CLIENT_ID` | Exposed via `/api/config/public` | `Update-AppSettings-v2.ps1 -GoogleClientId …` |
| `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp Cloud API | `Update-AppSettings-v2.ps1 -WhatsAppAccessToken …` |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WA business phone | `Update-AppSettings-v2.ps1 -WhatsAppPhoneNumberId …` |
| `WHATSAPP_WABA_ID` | Meta WA business account | `Update-AppSettings-v2.ps1 -WhatsAppWabaId …` |
| `WHATSAPP_APP_SECRET` | Meta app secret | `Update-AppSettings-v2.ps1 -WhatsAppAppSecret …` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Meta webhook handshake | `Update-AppSettings-v2.ps1 -WhatsAppWebhookVerifyToken …` |
| `WHATSAPP_ADMIN_NUMBER` | Admin notifications | Function App settings (manual) |
| `SMTP_HOST/PORT/USER/PASS/SECURE/SENDER_EMAIL/SENDER_NAME/REPLY_TO` | Order emails | `Update-AppSettings-v2.ps1 -SmtpPass …` (for the secret part) |
| `INVOICE_LOGO_URL` | Email/PDF logo | `Update-AppSettings-v2.ps1 -InvoiceLogoUrl …` |
| `EXPOSE_OTP_FOR_TESTING` | If `"1"`, OTP is returned in API response (DEV only) | Function App settings |
| `FREE_SHIPPING_THRESHOLD_PAISE` | Free-shipping cutoff | Function App settings |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Admin AI product copy | Function App settings |

### 11.3 GitHub secrets

| Secret | Used by | Notes |
|---|---|---|
| `AZURE_TENANT_ID` | Both deploy + both validate workflows | OIDC |
| `AZURE_SUBSCRIPTION_ID` | Both deploy workflows | OIDC |
| `AZURE_CLIENT_ID_DEV` | `deploy-*-dev.yml` | OIDC federated identity |
| `AZURE_CLIENT_ID_PRD` | `deploy-*-prd.yml` | OIDC federated identity |
| `AZURE_STATIC_WEB_APPS_API_TOKEN_DEV` | `deploy-frontend-dev.yml` | SWA deploy token |
| `AZURE_STATIC_WEB_APPS_API_TOKEN_PRD` | `deploy-frontend-prd.yml` | SWA deploy token |
| `POST_DEPLOY_TEST_CUSTOMER_EMAIL_DEV` | `validate-dev.yml` only | DEV signed-in journey |
| `POST_DEPLOY_TEST_CUSTOMER_PASSWORD_DEV` | `validate-dev.yml` only | DEV signed-in journey |

PRD validation references **zero** secrets — see §13.

---

## 12. CI/CD — GitHub Actions workflows

Seven workflows total: 4 deploys + 2 validators + 1 shared library.

### 12.1 Deploy workflows

| File | Trigger | Target |
|---|---|---|
| `deploy-frontend-dev.yml` | push to `develop` (frontend paths) + PR + manual | DEV SWA |
| `deploy-frontend-prd.yml` | push to `main` (frontend paths) + manual | PRD SWA (env gate) |
| `deploy-backend-dev.yml` | push to `develop` (backend paths) + manual | `func-srilathaartv2-dev` |
| `deploy-backend-prd.yml` | push to `main` (backend paths) + manual | `func-srilathaartv2-prd` (env gate) |

Frontend deploys fetch `RAZORPAY_KEY_ID` from the Function App at build time
and inject it as `NEXT_PUBLIC_RAZORPAY_KEY_ID`. This avoids storing
Razorpay creds in GitHub Secrets.

### 12.2 Validation workflows

See §13 — three files implementing the env-isolated post-deploy validation.

### 12.3 Concurrency posture

| Workflow | Group | `cancel-in-progress` |
|---|---|---|
| Frontend DEV deploy | `deploy-frontend-dev-{ref}` | true |
| Frontend PRD deploy | `deploy-frontend-prd` | **false** |
| Backend DEV deploy | `deploy-backend-dev-{ref}` | true |
| Backend PRD deploy | `deploy-backend-prd` | **false** |
| Validate DEV | `validate-dev` | true |
| Validate PRD | `validate-prd` | **false** |

PRD never cancels mid-flight.

---

## 13. Post-deployment validation

A separate, environment-isolated workflow per env that drives a headless
Chromium against the deployed site after every successful deploy.

### 13.1 Workflow structure

```
deploy-frontend-dev.yml ─┐                ┌── triggers
                          ├──▶ workflow_run ┤
deploy-backend-dev.yml  ─┘                └──▶ validate-dev.yml
                                                   │
                                                   │ uses (workflow_call)
                                                   ▼
                                          validation-shared.yml ──▶ runs
                                                   ▲                       Playwright
                                                   │ uses                  + axe-core
deploy-frontend-prd.yml ─┐                ┌── triggers                     against the
                          ├──▶ workflow_run ┤                              deployed URL.
deploy-backend-prd.yml  ─┘                └──▶ validate-prd.yml
```

### 13.2 What each validation run does

The runner ([`tests/post-deploy/run-validation.mjs`](tests/post-deploy/run-validation.mjs))
performs ~29 checks per run:

1. **API health** — `GET /products?limit=1`, `/config/public`, `/announcements`.
2. **Desktop page suite** — 10 routes at 1440×900, recording HTTP status,
   console errors, failed requests, axe-core findings, and a screenshot.
3. **Mobile page suite** — same 10 routes at iPhone 13 viewport with
   `isMobile: true`; also flags horizontal overflow.
4. **E2E journeys**:
   - Open auth modal from header
   - Shop → product detail (or themed not-found fallback)
   - Cart flow (add → /cart, asserts localStorage + empty-state copy)
   - Empty-submit form validation
   - Key copy assertions on 5 landing pages
5. **Authenticated journey (DEV only, requires secrets)**:
   - Sign in via the test customer → assert modal closes → assert user menu
     shows "Log out" → sign out.
6. **Razorpay sandbox checkout (DEV only)**:
   - Add → fill delivery form → step through Review → click Pay → assert
     `POST /api/orders` returns 200/201 → best-effort drive the Razorpay
     iframe with test card `5104 0600 0000 0008`.

### 13.3 Reporting

Three artefacts per run, uploaded as `validation-report-{env}-{run_id}` with
30-day retention:

- `results.json` — structured raw data.
- `report.html` — dark-themed self-contained HTML with collapsible per-check
  details and inline screenshots.
- `screenshots/*.png` — viewport captures.

In addition, the runner writes a Markdown summary directly into
`$GITHUB_STEP_SUMMARY` so the at-a-glance pass/warn/fail breakdown is
visible on the run page itself.

### 13.4 Environment isolation guarantees

1. Each entry-point workflow hardcodes its URLs — no detection logic.
2. `validate-prd.yml` contains **zero** references to any test-customer
   secret.
3. The runner additionally gates the signed-in + Razorpay journeys on
   `TARGET_ENV === 'dev'`, so even a misrouted secret could not cause a
   real login or test transaction against PRD.
4. Failed deploys never trigger validation (`if:
   workflow_run.conclusion == 'success'`).
5. Validation failure does **not** roll back the deploy — it surfaces the
   regression for triage.

### 13.5 Local smoke-running the validator

```powershell
cd tests/post-deploy
npm install
npx playwright install chromium
$env:SITE_URL='https://orange-forest-042a5df00.7.azurestaticapps.net'
$env:API_URL='https://func-srilathaartv2-dev.azurewebsites.net/api'
$env:TARGET_ENV='dev'
node run-validation.mjs
node generate-report.mjs
# Open artifacts/report.html in a browser.
```

---

## 14. Local development

### 14.1 Prerequisites

- Node.js ≥ 22
- npm ≥ 10
- PowerShell 7+
- Azure Functions Core Tools v4 (for backend dev)
- Optional: `az` CLI for ops scripts

### 14.2 First-run

```powershell
# From repo root
powershell -ExecutionPolicy Bypass -File setup.ps1
```

This copies AI-generated images, installs frontend deps, scaffolds
`frontend/.env.local`, and starts `next dev` on `http://localhost:3000`.

### 14.3 Daily commands

**Frontend**

```powershell
cd frontend
npm run dev         # turbopack dev server
npm run typecheck   # tsc --noEmit
npm run build       # static export to ./out
```

**Backend**

```powershell
cd backend
npm run dev          # tsc -w + func start (port 7071)
npm run build        # tsc to ./dist
```

**Both at once**

```bat
start-dev.bat        # opens two windows, one per side
```

### 14.4 Frontend `.env.local` template

```
NEXT_PUBLIC_API_URL=http://localhost:7071/api
NEXT_PUBLIC_ASSET_BASE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

For local image rendering, you can copy `frontend/out/images/*.png` into
`frontend/public/seed/` (gitignored) and the dev server will serve them at
`/seed/<filename>.png`.

---

## 15. Testing

### 15.1 Local e2e (mocked backend)

```powershell
cd <repo root>
npm install
npx playwright test tests/auth.spec.ts
# Or:
npm run test:e2e
```

`tests/auth.spec.ts` stubs every `/api/auth/*` call inside the Playwright
process, so no real backend or Azurite is needed.

### 15.2 UX-review captures (live URL)

```powershell
npx playwright test --config=playwright.live.config.ts tests/ux-review.spec.ts
npx playwright test --config=playwright.live.config.ts tests/ux-polish.spec.ts
npx playwright test --config=playwright.live.config.ts tests/ux-home-sections.spec.ts
```

These point at the live SWA URL and write screenshots to
`c:/tmp/srilatha-ux-review/`.

### 15.3 Post-deploy validation suite

See §13.5 — runs locally via `node run-validation.mjs`.

### 15.4 Type checks (CI gate)

```powershell
cd frontend && npm run typecheck
cd ../backend && npx tsc --noEmit
```

Both must pass before merging.

---

## 16. Operational runbooks

All scripts live in [`infra/`](infra/). Each accepts `-WhatIf` for dry-run
where supported.

### 16.1 First-time setup

```powershell
# 1. Provision Azure resources
./infra/Deploy-Infrastructure-v2.ps1 -Environment dev

# 2. Seed an admin user
./infra/seed-admin.ps1 -Environment dev `
    -Email you@example.com -Password 'Sup3rSecret!' -Name 'You'

# 3. Bootstrap WhatsApp + SMTP + GOOGLE_CLIENT_ID + Razorpay
./infra/Update-AppSettings-v2.ps1 -Environment dev `
    -SmtpPass '…' -WhatsAppAccessToken '…' -GoogleClientId '…'

./infra/Rotate-RazorpayApiKeys-v2.ps1 -Environment dev `
    -KeyId 'rzp_test_…' -KeySecret '…'

./infra/Rotate-RazorpayWebhookSecret-v2.ps1 -Environment dev `
    -WebhookSecret '…'
```

### 16.2 Deploy

Both frontend and backend deploys are triggered by **pushing the relevant
branch** (`develop` → DEV, `main` → PRD). Manual run is also available via
`workflow_dispatch` in the GitHub UI.

Hot-fix path for backend without redeploying frontend: push a backend-only
commit to `develop` (or `main`). The `paths:` filter ensures only the
backend deploy fires.

### 16.3 Rotate a Razorpay key

```powershell
./infra/Rotate-RazorpayApiKeys-v2.ps1 -Environment prd `
    -KeyId 'rzp_live_NEW' -KeySecret 'NEW_SECRET'
```

The script takes a pre-update Key Vault backup, applies the change, takes a
post-update backup, then verifies. To roll back, use
`Restore-function-settings-v2.ps1`.

### 16.4 Rotate the Google OAuth Client ID

```powershell
./infra/Update-AppSettings-v2.ps1 -Environment prd `
    -GoogleClientId '1234567890-newhash.apps.googleusercontent.com'
```

Frontend rebuild is **not** required — the next page load fetches the new
ID via `/api/config/public`.

### 16.5 Restore from Key Vault backup

```powershell
./infra/Restore-function-settings-v2.ps1 -Environment prd `
    -ReasonContains 'pre-update: razorpay api keys'
```

Each backup is tagged with the script + reason that wrote it. The
`-ReasonContains` filter targets the right snapshot.

### 16.6 Cross-resource sanity audit

```powershell
./infra/Audit-Wiring.ps1 -Environment prd
```

Walks every setting against the expected resource graph and reports drift
(missing settings, dangling refs).

### 16.7 Send a manual WhatsApp order confirmation

```powershell
./infra/Send-WhatsAppOrderConfirmation.ps1 -Environment prd `
    -Phone '+919876543210' -OrderId 'ORD-1729...'
```

For the rare case where the automated send failed and you want to retry
outside the app.

### 16.8 Investigating a failed validation

1. Go to the **Actions** tab → `Validate DEV after Deploy` (or PRD).
2. Open the failing run; the Markdown summary on the run page shows the
   breakdown.
3. Download the `validation-report-{env}-{run_id}` artifact.
4. Unzip and open `report.html` for the dark-themed UI with inline
   screenshots and per-check detail.

---

## 17. Conventions

### 17.1 Branching

- `develop` — DEV environment, integration branch.
- `main` — PRD environment, only fast-forward merges from `develop` (or
  hot-fix branches).
- Feature branches: `feat/*`, `fix/*`, `chore/*` off `develop`.

### 17.2 Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) lite. Common
scopes: `feat`, `fix`, `chore`, `docs`, `ci`, `test`, `refactor`.

Examples:
```
feat(auth): customer Google login + WhatsApp OTP password reset
fix(infra): -IgnoreAzAuth switch now actually skips auth
ci(validation): split post-deploy validation into env-isolated workflows
```

### 17.3 Pre-merge checklist

- [ ] `frontend` typecheck passes (`cd frontend && npm run typecheck`)
- [ ] `backend` typecheck passes (`cd backend && npx tsc --noEmit`)
- [ ] If touching auth/cart/checkout: run `tests/auth.spec.ts` locally.
- [ ] If changing copy: skim `tests/ui-truthfulness.spec.ts` to make sure
      it still passes.
- [ ] No NEW use of `process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID` (this has
      been retired in favour of runtime config).

### 17.4 Comments policy

Comments explain **why**, not what. Each non-trivial design decision in the
codebase should leave a one-paragraph note (see e.g.
[`runtime/GoogleAuthGate.tsx`](frontend/components/runtime/GoogleAuthGate.tsx)
or [`functions/orders.ts`](backend/src/functions/orders.ts)).

---

## 18. Troubleshooting

| Symptom | Likely cause | Where to look |
|---|---|---|
| "Continue with Google" button disabled | `GOOGLE_CLIENT_ID` empty in Function App settings, or `/api/config/public` 5xx | Function App config → `GOOGLE_CLIENT_ID`; browser network panel for `/api/config/public` |
| Product detail 404 on a newly-added slug | Static export ran before the product existed | Either redeploy frontend, or wait — `not-found.tsx` already client-fetches by slug as a fallback. |
| Razorpay test mode says "key mismatch" | DEV Function App holds live keys (or vice-versa) | `Rotate-RazorpayApiKeys-v2.ps1 -Environment dev -KeyId 'rzp_test_…'` |
| Order saved as `confirmed` but no email sent | SMTP creds rotated and not propagated | Function App config → SMTP_* group; check `order-success` page — it surfaces the truthful send result. |
| WhatsApp OTP not arriving | Access token expired or rate-limited | Function App config → `WHATSAPP_ACCESS_TOKEN`; Meta business manager for delivery logs. |
| Admin login keeps 401 | Password hash drifted across env, or wrong `JWT_SECRET` | Re-seed via `seed-admin.ps1 -ResetPassword`. |
| Post-deploy validation passes but site is broken | Likely an axe/console-error warning (not a fail), or a route the suite doesn't cover | Open the HTML report; the **Warnings** column tells you what changed. |
| Validation can't reach Function App from local | Corporate network blocks Azure cert revocation check (CRYPT_E_NO_REVOCATION_CHECK) | This is local-only — GitHub-hosted runners hit Azure cleanly. |
| `next build` fails with "Page is missing generateStaticParams()" | Empty product list from the API at build time | The product `[slug]` route already returns a `__placeholder` sentinel — make sure your DEV API is reachable from the GitHub runner. |

---

## 19. Roadmap / backlog

The living list lives in
[`improvements_needed/improments_to_be_implemented.md`](improvements_needed/improments_to_be_implemented.md).
Highlights at the time of writing:

- Account lockout after 6 incorrect password attempts.
- Distinct error messages for "password incorrect" vs "account does not
  exist" (currently merged for security; the UX trade-off is being
  reconsidered).
- Tier-C signed-in journeys (orders, wishlist) — needs a seeded historical
  order on the DEV test customer.
- Tier-D verified-buyer review submission — needs cleanup logic in the
  validator so we don't accumulate pending reviews.
- Visual regression diffing (currently capture-only, no diffing).
- Lighthouse / detailed waterfall as a separate weekly schedule.

---

*Wiki last refreshed: 2026-06-17. Edit this file when any of the structural
decisions documented above change.*
