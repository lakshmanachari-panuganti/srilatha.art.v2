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
| **VUL-016** (`zod` per endpoint) | Bigger refactor; tracked separately. |

---

## 2026-06-21 — Phase 2: Server-side trust boundaries (no client changes)

Phase 2 closes the remaining server-trust issues that don't need client
changes. Backend `tsc` and frontend `next build` both pass clean.

### VUL-001 — `createOrder` now resolves prices server-side (price tampering)
**Severity:** CRITICAL
**File:** [`backend/src/functions/orders.ts`](backend/src/functions/orders.ts)
(`createOrder`)

The endpoint was summing `item.qty * item.price` directly from the
request body and creating a Razorpay order for that amount. An attacker
could submit `price: 100` (₹1 in paise) for any product and pay ₹1 for it.

**Fix:**
1. New helper `findProductById(productId)` does a cross-partition lookup
   of the products table by `RowKey` and refuses soft-deleted entries
   (`active === false`).
2. The handler now resolves every cart item against the catalog and
   builds a server-trusted `resolved[]` array using the catalog's
   `price` and `name`. The client-supplied `price` and `name` are
   ignored.
3. `qty` is clamped to `[1, 99]` and coerced to an integer.
4. Cart size capped at 50 items.
5. Missing/inactive products return **400** with the offending
   `productId` so the UI can prompt the user to refresh.
6. The persisted `orderItems` rows now use the server-trusted values, so
   audit trails reflect what was actually charged.

The response shape (`orderId`, `razorpayOrderId`, `amount`, `subtotal`,
`shipping`, `discount`, `appliedCouponCode`, `currency`, `key`) is
unchanged for legitimate clients — only the *computed amount* differs
when a client lies about the price.

---

### VUL-006 — OData filters use the `odata\`\`` tagged template
**Severity:** MEDIUM
**Files:**
[`backend/src/functions/orders.ts`](backend/src/functions/orders.ts),
[`backend/src/functions/products.ts`](backend/src/functions/products.ts),
[`backend/src/functions/productAdmin.ts`](backend/src/functions/productAdmin.ts),
[`backend/src/functions/orderAdmin.ts`](backend/src/functions/orderAdmin.ts),
[`backend/src/functions/reviewsAdmin.ts`](backend/src/functions/reviewsAdmin.ts),
[`backend/src/functions/customOrdersAdmin.ts`](backend/src/functions/customOrdersAdmin.ts),
[`backend/src/functions/couponsAdmin.ts`](backend/src/functions/couponsAdmin.ts),
[`backend/src/functions/razorpay-webhook.ts`](backend/src/functions/razorpay-webhook.ts),
[`backend/src/functions/whatsappWebhook.ts`](backend/src/functions/whatsappWebhook.ts),
[`backend/src/functions/customerReviews.ts`](backend/src/functions/customerReviews.ts)

Many queries built the OData `filter` string by interpolating
request-derived values without escaping single quotes. Hand-rolled
`.replace(/'/g, "''")` was applied in only two spots and easy to
regress — any new identity-scoped query built the same way could leak
other users' data.

**Fix:** every queryable filter that accepts a user-controlled value
now uses the
[`odata\`\`` tagged template from `@azure/data-tables`](https://learn.microsoft.com/javascript/api/@azure/data-tables/?view=azure-node-latest),
which centralizes quoting. Behavior is preserved for legitimate inputs;
malicious quotes are now safely escaped.

Filter strings built from hardcoded literals (`PartitionKey eq 'customer'`,
`PartitionKey eq 'health' and RowKey eq 'singleton'`, etc.) were left as
plain template literals — there's no user input to escape.

---

### VUL-013 — `EXPOSE_OTP_FOR_TESTING` is now triple-gated
**Severity:** LOW (conditional on misconfiguration)
**File:** [`backend/src/functions/customerPasswordReset.ts`](backend/src/functions/customerPasswordReset.ts)

Previously, setting `EXPOSE_OTP_FOR_TESTING=true` made the password-reset
response include the literal OTP — fully defeating the OTP factor if the
flag was ever left on in production by mistake.

**Fix:** the flag is now active only if **all three** are true:
1. `NODE_ENV !== 'production'`
2. `ALLOW_DEV_FLAGS=true` (separate explicit opt-in)
3. `EXPOSE_OTP_FOR_TESTING=true`

Additionally:
- If the flag was *requested* but is being ignored due to one of the
  guards, a startup `console.warn` makes operators aware.
- If the flag is ACTIVE, a louder startup `console.warn` reminds
  operators it must never be set in production.

---

## Validation (Phase 2)

- Backend: `npm run build` (tsc) — **passes clean**.
- Frontend: `npm run build` (next build, static export) — **passes
  clean**, all 28 routes generated.
- Frontend client contract: `createOrder` response shape is identical
  for legitimate carts. New failure modes (400 `productId unavailable`,
  400 `Too many items`, 400 `Invalid quantity`) surface cleanly via the
  existing `ApiError` handling and tell the user to refresh their cart.

---

## 2026-06-21 — Phase 3: Coordinated client/server hardening

Phase 3 closes the remaining audit findings that needed coordinated
backend + frontend changes. Backend `tsc` and frontend `next build` both
pass clean.

### VUL-004 (full fix) — `verifyPayment` now requires a signed order session token
**Severity:** HIGH
**Files:**
[`backend/src/functions/orders.ts`](backend/src/functions/orders.ts),
[`frontend/lib/api.ts`](frontend/lib/api.ts),
[`frontend/app/checkout/page.tsx`](frontend/app/checkout/page.tsx)

Phase 1 already bound the Razorpay HMAC to the stored order and used a
timing-safe compare. The remaining gap was that `verifyPayment` had no
caller authentication at all, which mattered most for guest checkout
where there's no customer JWT. An attacker who watched a victim's
Razorpay flow could still attempt to flip the victim's order to
`confirmed` using their own signature.

**Fix:**
1. `createOrder` now mints a short-lived (1h) HMAC-signed `orderToken`
   carrying `{ purpose: 'order-session', orderId, razorpayOrderId }` and
   returns it in the response.
2. `verifyPayment` requires this token via the `Authorization: Bearer`
   header. The token's `purpose`, `orderId` (vs route), and
   `razorpayOrderId` (vs body) are all verified before any state change.
3. The frontend's `verifyPayment` helper now takes the `orderToken` as a
   third argument; the checkout page passes it through Razorpay's
   handler. Guest checkout still works — no customer JWT is required.

---

### VUL-008 — Wildcard CORS replaced with an allowlist via `wrapCors`
**Severity:** MEDIUM
**Files:**
[`backend/src/utils/cors.ts`](backend/src/utils/cors.ts) (new),
every `backend/src/functions/*.ts` registration

Every endpoint previously returned `Access-Control-Allow-Origin: *`,
which removed a useful defense layer against XSS-driven token theft.

**Fix:** new `wrapCors(handler)` helper wraps every `app.http()`
registration. The wrapper:
- Reflects only origins in `ALLOWED_ORIGINS` (currently
  `http://localhost:3000`, `https://www.srilatha.art`,
  `https://srilatha.art`, `https://www.lucky1.online`, and the dev SWA
  preview URL).
- Sets `Vary: Origin` so caches behave correctly.
- Intercepts `OPTIONS` pre-flights uniformly so per-file `options()`
  helpers don't drift.
- Removes the wildcard `*` from every response, so unknown origins
  are treated as cross-origin blocked by the browser. Non-browser
  clients (server-to-server, curl) are unaffected.

55 handler registrations across 23 files now wrap with `wrapCors`.

---

### VUL-009 — Customer/admin token revocation + 24h TTL with refresh
**Severity:** MEDIUM
**Files:**
[`backend/src/utils/customerStore.ts`](backend/src/utils/customerStore.ts),
[`backend/src/functions/customerAuth.ts`](backend/src/functions/customerAuth.ts),
[`backend/src/functions/adminAuth.ts`](backend/src/functions/adminAuth.ts),
[`backend/src/middleware/adminGuard.ts`](backend/src/middleware/adminGuard.ts),
[`backend/src/functions/orders.ts`](backend/src/functions/orders.ts),
[`backend/src/functions/customerReviews.ts`](backend/src/functions/customerReviews.ts),
[`frontend/components/auth/AuthProvider.tsx`](frontend/components/auth/AuthProvider.tsx),
[`frontend/components/admin/AdminAuthProvider.tsx`](frontend/components/admin/AdminAuthProvider.tsx),
[`frontend/lib/api.ts`](frontend/lib/api.ts),
[`frontend/lib/adminApi.ts`](frontend/lib/adminApi.ts)

Customer tokens were 30 days with no revocation. A token stolen via XSS
or token-bearer leak was therefore valid for up to a month, with no
server-side lever to cut it short.

**Fix:**
1. **Token versioning.** Both `CustomerEntity` and `AdminEntity` gained
   a `tokenVersion?: number` field. Issued JWTs now carry a matching
   `ver` claim plus a unique `jti`.
2. **Verify-side check.** Customer and admin JWT verify paths now load
   the entity and reject tokens whose `ver` is behind the server's
   record. A new shared helper `verifyCustomerToken` consolidates the
   customer-side logic. `readAdminClaims` / `requireAdmin` became async.
   Legacy tokens without a `ver` claim are treated as `ver: 0` so
   existing sessions survive the deploy until they age out.
3. **Logout = revoke.** `/api/auth/logout` and `/api/mgmt/logout` bump
   `tokenVersion`, invalidating every outstanding token for that account
   (including on other devices / stolen copies). `setPasswordHash` also
   bumps the version, so password resets revoke too.
4. **Shorter customer TTL.** Customer token TTL dropped from 30 days to
   24 hours.
5. **Silent refresh.** New `/api/auth/refresh` mints a fresh token if
   the presented one is still valid OR recently expired (within a 7-day
   grace window). `AuthProvider` schedules a refresh 4 hours before
   expiry and also runs a refresh on mount when the stored token has
   already aged out, so active users never see a sign-out and idle
   users (offline a few days) come back cleanly.
6. **Frontend wiring.** `AuthProvider.logout` and
   `AdminAuthProvider.logout` now call the server-side logout endpoint
   in the background so a sign-out on one device revokes other tabs.
   Local state is cleared immediately regardless of network.

Admin token TTL stays at 12 hours (was already short).

---

## Validation (Phase 3)

- Backend: `npm run build` (tsc) — **passes clean**.
- Frontend: `npm run build` (next build, static export) — **passes
  clean**, all 28 routes generated.
- Frontend client contract: `createOrder` response now includes
  `orderToken` and `orderTokenExpiresIn` (additive). `verifyPayment`'s
  client helper signature changed from `(orderId, input)` to
  `(orderId, input, orderToken)` — all internal callers are updated.
  AuthProvider preserves the existing API (`{ user, login, logout }`)
  so no consumer needs to change.

## Notes for the deploy

- The customer-token TTL change is **active immediately**, but existing
  30-day tokens stay valid until their original `exp`. Users who sign
  in after deploy get 24h tokens (with silent refresh).
- Admin `tokenVersion` defaults to 0 for legacy rows. The first
  successful login after deploy issues a fresh `ver: 0` token; logout
  bumps the row to 1, invalidating any older tokens that somehow
  carried a different `ver`.
- `GOOGLE_CLIENT_ID` must be set in the Function App config for the
  Google sign-in path to work (it already is — verified via
  `Update-AppSettings-v2.ps1`).
- The CORS allowlist must be extended in
  [`backend/src/utils/cors.ts`](backend/src/utils/cors.ts) whenever a
  new SWA preview / custom domain is added.
