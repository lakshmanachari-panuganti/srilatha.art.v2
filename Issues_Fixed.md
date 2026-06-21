# Issues Fixed

A running record of security and quality issues that have been resolved.
Findings are referenced by the IDs from the security audit dated **2026-06-20**.

---

## 2026-06-21 — Phase 1: Fully-safe security fixes (no client changes)

All changes below are server-side or config-only. The frontend was not
modified; the existing API contracts (request shapes, response shapes,
status codes for the happy path) are unchanged. Backend type-checks clean
(`tsc`) and the frontend builds clean (`next build`).

### VUL-012 — JWT `verify` calls now pin the algorithm to HS256
**Severity:** LOW
**Files:**
[`backend/src/middleware/adminGuard.ts`](backend/src/middleware/adminGuard.ts),
[`backend/src/functions/customerReviews.ts`](backend/src/functions/customerReviews.ts),
[`backend/src/functions/customerPasswordReset.ts`](backend/src/functions/customerPasswordReset.ts),
[`backend/src/functions/orders.ts`](backend/src/functions/orders.ts)

`jwt.verify(token, JWT_SECRET)` was being called without an `algorithms`
option. With a symmetric string secret the classic RS256→HS256 confusion
isn't directly reachable, but pinning is best practice and prevents
regressions if signing ever moves to keys.

**Fix:** every `jwt.verify` call now passes `{ algorithms: ['HS256'] }`.

---

### VUL-014 — Constant-time login (no account-existence enumeration via timing)
**Severity:** LOW
**Files:** [`backend/src/functions/adminAuth.ts`](backend/src/functions/adminAuth.ts),
[`backend/src/functions/customerAuth.ts`](backend/src/functions/customerAuth.ts)

Previously, `bcrypt.compare` only ran when the account existed; a missing
account returned immediately. The response-time difference revealed which
emails/phones were registered.

**Fix:** when no matching account is found, we now run a dummy
`bcrypt.compare` against a constant, never-matching hash before returning
the generic 401, so the latency is indistinguishable between known and
unknown identifiers.

---

### VUL-003 — `GET /api/orders/{orderId}` now enforces ownership
**Severity:** HIGH
**File:** [`backend/src/functions/orders.ts`](backend/src/functions/orders.ts)
(`getOrder`)

The endpoint verified the JWT was valid but discarded the claims, so any
authenticated customer could read any order. Combined with sequential
`ORD-${Date.now()}` IDs, the entire order base (customer name, email,
phone, address) was enumerable.

**Fix:** the JWT claims are now captured; after loading the order, the
caller's email is compared against the order's stored customer email. On
mismatch the endpoint returns **404** (not 403) so the caller cannot even
confirm whether the order exists.

> Note: order ID format was *not* changed in this phase to avoid
> invalidating existing pending/shipped orders. The ownership check is
> sufficient to close the disclosure; ID format change can follow later
> as a clean cutover if desired.

---

### VUL-004 (binding portion) — `verifyPayment` now binds the signed Razorpay order to the order being confirmed
**Severity:** HIGH
**File:** [`backend/src/functions/orders.ts`](backend/src/functions/orders.ts)
(`verifyPayment`)

The HMAC signature was validated correctly over
`razorpayOrderId|razorpayPaymentId`, but the route's `orderId` was never
checked against the stored `orderEntity.razorpayOrderId`. An attacker
could pay for their own cheap order, then replay the (valid) signature
against a *different* victim `orderId` to flip the victim's pending order
to `confirmed`.

**Fix:**
1. The order is loaded **before** signature checking.
2. The endpoint now asserts
   `orderEntity.razorpayOrderId === body.razorpayOrderId`; mismatches
   return 400 `Order/payment mismatch`.
3. The HMAC comparison was switched from `!==` (variable-time string
   compare) to `crypto.timingSafeEqual` over buffers.

> Deferred (needs verification of guest-checkout impact): adding an
> `Authorization: Bearer` requirement on `verifyPayment` itself. That
> piece is in the next phase.

---

### VUL-002 / VUL-005 / VUL-011 — Google sign-in hardened
**Severity:** CRITICAL (VUL-002), HIGH (VUL-005), MEDIUM (VUL-011)
**File:** [`backend/src/functions/customerGoogleAuth.ts`](backend/src/functions/customerGoogleAuth.ts)

Three related findings, fixed together:

| ID | Issue | Fix |
|---|---|---|
| **VUL-002** | `POST /api/auth/google` accepted a raw `profile` object from the client and issued a session for whatever email was in it. Trivial account takeover. | The `body.profile` branch is removed entirely. Only access tokens are accepted now. |
| **VUL-005** | The access token was exchanged at Google's `userinfo` endpoint, which doesn't validate the token's **audience** (`aud`). A token minted for *any other* Google OAuth app could be replayed here. | The token is now also sent to Google's `tokeninfo` endpoint and we assert `tokeninfo.aud === GOOGLE_CLIENT_ID` before trusting the userinfo response. |
| **VUL-011** | The `email_verified` flag returned by Google was ignored. An unverified email could be claimed and used as the account's primary key. | We now require `profile.email_verified === true` (also accepting the string `"true"` Google sometimes returns) before issuing a session. |

The frontend always sends `accessToken` (`AuthModal.tsx`, `login/page.tsx`)
so removing the `profile` branch is a no-op for legitimate clients.
`GOOGLE_CLIENT_ID` is already provisioned as a Function App setting and
already exposed via `/api/config/public`.

---

### VUL-007 — Security headers added to Azure Static Web App
**Severity:** MEDIUM
**File:** [`frontend/staticwebapp.config.json`](frontend/staticwebapp.config.json)

The SWA config previously had no `globalHeaders` block, so responses
shipped without CSP, HSTS, X-Frame-Options, X-Content-Type-Options, or
Referrer-Policy. Because the build is `output: 'export'`,
`next.config` `headers()` does not apply — headers must live in
`staticwebapp.config.json`.

**Fix — enforced from day one (low breakage risk):**
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`

**Fix — Content-Security-Policy in report-only mode (to tune safely):**
A `Content-Security-Policy-Report-Only` header was added covering Razorpay
checkout, Google sign-in, Azure Functions, and Azure Blob storage. Browser
console will report any violations without blocking the page; once
verified across the live flows we can promote it to enforcing
`Content-Security-Policy`.

---

### VUL-010 — Rate limiting on admin/customer login + register
**Severity:** MEDIUM
**Files:** [`backend/src/utils/rateLimit.ts`](backend/src/utils/rateLimit.ts) (new),
[`backend/src/functions/adminAuth.ts`](backend/src/functions/adminAuth.ts),
[`backend/src/functions/customerAuth.ts`](backend/src/functions/customerAuth.ts)

The OTP reset flow had good throttling, but `admin/login`, `auth/login`,
and `auth/register` had none — enabling online password brute force and
registration spam.

**Fix:** a small sliding-window helper (`enforceRateLimit`) backed by a
`rateLimits` Table Storage table, with these initial thresholds (set
generously so no real user hits them; tight enough to stall scripted
brute force):

| Endpoint | Per IP | Per identifier/email | Window |
|---|---|---|---|
| `POST /api/mgmt/login` | 30 | 10 | 15 min |
| `POST /api/auth/login` | 30 | 10 | 15 min |
| `POST /api/auth/register` | 10 | — | 60 min |

When the limit is hit, the endpoint returns **429** with an accurate
`Retry-After` header. The helper **fails open** on storage errors so a
flaky Table Storage call cannot lock real users out.

---

### VUL-015 — Dependabot + CodeQL workflows added
**Severity:** LOW (process gap)
**Files:** [`.github/dependabot.yml`](.github/dependabot.yml) (new),
[`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) (new)

There was no Dependabot, CodeQL, or secret-scanning automation to catch
future drift or accidental secret commits.

**Fix:**
- **Dependabot:** weekly Monday 06:00 IST scans of `/backend`, `/frontend`,
  `/whatsapp-service`, and `/.github/workflows`. `@azure/*`, `@types/*`,
  and React/Next packages are grouped to keep PR noise low.
- **CodeQL:** runs on push and PR to `main`/`develop`, plus weekly Monday
  schedule, using the `security-and-quality` query suite for JavaScript /
  TypeScript.

> Still recommended (manual repo settings, not code): enable
> **GitHub Secret Scanning + push protection** in the repo's Security
> settings.

---

## Validation

- Backend: `npm run build` (tsc) — **passes clean**.
- Frontend: `npm run build` (next build, static export) — **passes
  clean**, all 28 routes generated.
- Frontend client contract: response shapes for `/orders`,
  `/orders/{id}/verify-payment`, `/auth/google`, `/auth/login`,
  `/auth/register`, `/mgmt/login` are unchanged for successful calls. New
  failure modes (429, 400 `Order/payment mismatch`, 401 unverified email,
  401 missing audience) are well-defined and surface cleanly via the
  existing `ApiError` handling.

## What's deferred to subsequent phases

| ID | Reason for deferral |
|---|---|
| **VUL-001** (server-side price) | "Safe but needs verification" — needs a log-mismatch-then-enforce rollout to be sure no edge case in the catalog is missed. Next phase. |
| **VUL-004** (require JWT on `verifyPayment`) | Could break guest checkout if that flow exists. Audit first, then enable. Next phase. |
| **VUL-006** (`odata\`\`` filter builder) | Mechanical sweep across many files — better as its own focused PR. |
| **VUL-008** (CORS allowlist) | Needs the full list of dev/preview/prod SWA origins before we can safely drop `*`. |
| **VUL-009** (cookie auth + revocation) | Coordinated client change. Phase 3. |
| **VUL-013** (`EXPOSE_OTP_FOR_TESTING`) | Conditional on prod misconfig — verify prod App Settings rather than rewrite. |
| **VUL-016** (`zod` per endpoint) | Bigger refactor; should land alongside the VUL-001 fix. |
