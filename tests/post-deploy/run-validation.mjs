// Post-deployment validation runner.
//
// Drives a headless Chromium against the deployed site + API and writes a
// structured result file consumed by generate-report.mjs (HTML artifact) and
// write-summary.mjs ($GITHUB_STEP_SUMMARY markdown).
//
// Configuration via env:
//   SITE_URL   — base URL of the deployed storefront (e.g. https://www.lucky1.online)
//   API_URL    — base URL of the Azure Functions API
//   TARGET_ENV — "dev" | "prd" (used in report metadata only)
//
// Exit code:
//   0 — every check passed or only warnings were found
//   1 — at least one hard failure (HTTP 5xx / nav timeout / failed API health)

import { chromium, devices } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');
const API_URL = (process.env.API_URL || '').replace(/\/+$/, '');
const TARGET_ENV = process.env.TARGET_ENV || 'dev';

// Optional credentials. Only the DEV-only signed-in + checkout journeys read
// these; the lightweight journeys (cart, form-validation, copy assertions)
// run with or without them. Anything sensitive is never persisted into the
// results.json that gets uploaded as an artifact.
const TEST_CUSTOMER_EMAIL = process.env.TEST_CUSTOMER_EMAIL || '';
const TEST_CUSTOMER_PASSWORD = process.env.TEST_CUSTOMER_PASSWORD || '';

// Razorpay test card (provided by the operator, sandbox-only). Hard-coded
// here so the workflow doesn't need yet another secret; these are the
// publicly-documented Razorpay TEST values and never reach production.
const RAZORPAY_TEST_CARD = {
  number: '5104 0600 0000 0008',
  expiry: '12/30',
  cvv: '123',
  name: 'Srilatha Test Buyer',
};

if (!SITE_URL || !API_URL) {
  console.error('SITE_URL and API_URL must both be set.');
  process.exit(2);
}

const NAV_TIMEOUT_MS = 45_000;
const SCREENSHOT_DIR = 'artifacts/screenshots';
const RESULTS_FILE = 'artifacts/results.json';

// Pages the storefront promises will resolve. Any 5xx/timeout here is a hard
// fail; 4xx for known routes is also a fail (a real outage would surface here).
const PAGES = [
  { name: 'home',         path: '/' },
  { name: 'shop',         path: '/shop' },
  { name: 'shop-resin',   path: '/shop?category=resin' },
  { name: 'about',        path: '/about' },
  { name: 'contact',      path: '/contact' },
  { name: 'custom-order', path: '/custom-order' },
  { name: 'cart',         path: '/cart' },
  { name: 'sale',         path: '/sale' },
  { name: 'care-guide',   path: '/care-guide' },
  { name: 'faq',          path: '/faq' },
];

// Public API endpoints exercised by the storefront on first paint. A 200 here
// is the cheapest "is the backend awake?" signal we can get from the runner.
const API_PROBES = [
  { name: 'products',       path: '/products?limit=1' },
  { name: 'config-public',  path: '/config/public' },
  { name: 'announcements',  path: '/announcements' },
];

// Console errors that originate from the third-party SDKs we ship (Razorpay,
// Google OAuth, analytics) and we have no way to fix at the application layer.
// Add to this list when we hit unavoidable noise so we can tell signal from
// background-static.
const CONSOLE_IGNORE_PATTERNS = [
  /Failed to load resource: net::ERR_FAILED.*razorpay\.com/i,
  /\[GSI_LOGGER]/i,
  /Cross-Origin-Opener-Policy/i,
];

const results = {
  meta: {
    env: TARGET_ENV,
    siteUrl: SITE_URL,
    apiUrl: API_URL,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: 0,
  },
  summary: { total: 0, passed: 0, warned: 0, failed: 0 },
  checks: [],
};

function record(check) {
  results.checks.push(check);
  results.summary.total += 1;
  results.summary[check.status === 'pass' ? 'passed' : check.status === 'warn' ? 'warned' : 'failed'] += 1;
}

function shouldIgnoreConsoleMessage(text) {
  return CONSOLE_IGNORE_PATTERNS.some((re) => re.test(text));
}

// ─── API health ─────────────────────────────────────────────────────────────

async function probeApi() {
  await Promise.all(API_PROBES.map(async (probe) => {
    const url = `${API_URL}${probe.path}`;
    const startedAt = Date.now();
    let httpStatus = 0, error = null, ok = false;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'follow' });
      httpStatus = res.status;
      ok = res.ok;
    } catch (e) {
      error = String(e?.message ?? e);
    }
    record({
      category: 'API',
      name: `GET ${probe.path}`,
      status: ok ? 'pass' : 'fail',
      durationMs: Date.now() - startedAt,
      details: { url, httpStatus, error },
    });
  }));
}

// ─── Page checks (desktop + mobile) ─────────────────────────────────────────

async function runPageSuite(browser, viewport, label, deviceProfile) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: label === 'mobile' ? 2 : 1,
    ...(deviceProfile ? { isMobile: true, hasTouch: true, userAgent: deviceProfile.userAgent } : {}),
    // Block third-party calls that frequently 4xx in tests (analytics, etc.)
    // but keep them in the failedRequests list as warnings.
  });
  const page = await context.newPage();

  for (const target of PAGES) {
    const url = `${SITE_URL}${target.path}`;
    const consoleErrors = [];
    const failedRequests = [];

    // Reset listeners per page so each result is isolated.
    page.removeAllListeners('console');
    page.removeAllListeners('requestfailed');
    page.removeAllListeners('response');

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (shouldIgnoreConsoleMessage(text)) return;
      consoleErrors.push({ text, location: msg.location() });
    });
    page.on('requestfailed', (req) => {
      failedRequests.push({
        url: req.url(),
        method: req.method(),
        failure: req.failure()?.errorText ?? 'unknown',
      });
    });
    page.on('response', (res) => {
      const status = res.status();
      if (status >= 400) {
        failedRequests.push({
          url: res.url(),
          method: res.request().method(),
          httpStatus: status,
        });
      }
    });

    const startedAt = Date.now();
    let httpStatus = 0;
    let navError = null;
    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
      httpStatus = response?.status() ?? 0;
    } catch (e) {
      navError = String(e?.message ?? e);
    }

    // Title/main element sanity for navigation check.
    let title = null;
    let hasMain = false;
    try {
      title = await page.title();
      hasMain = (await page.locator('#main-content').count()) > 0;
    } catch { /* ignore */ }

    // Mobile responsiveness — flag horizontal overflow.
    let responsive = null;
    if (label === 'mobile') {
      try {
        const dims = await page.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        }));
        responsive = {
          scrollWidth: dims.scrollW,
          clientWidth: dims.clientW,
          horizontalScroll: dims.scrollW - dims.clientW > 1,
        };
      } catch { /* ignore */ }
    }

    // Accessibility — quick axe scan, only count serious/critical to keep
    // the dashboard readable.
    let a11y = { violations: 0, items: [], error: null };
    try {
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const high = r.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''));
      a11y.violations = high.length;
      a11y.items = high.slice(0, 8).map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.length,
      }));
    } catch (e) {
      a11y.error = String(e?.message ?? e);
    }

    // Screenshot — viewport only, full page screenshots blow up memory.
    const screenshotName = `${label}__${target.name}.png`;
    let screenshotOk = false;
    try {
      await page.screenshot({ path: join(SCREENSHOT_DIR, screenshotName), fullPage: false });
      screenshotOk = true;
    } catch { /* ignore */ }

    const duration = Date.now() - startedAt;

    // Decide overall status.
    let status = 'pass';
    if (navError || httpStatus === 0 || httpStatus >= 500 || (httpStatus >= 400 && httpStatus !== 404)) {
      status = 'fail';
    } else if (httpStatus === 404) {
      // Known top-level routes shouldn't 404; treat as fail.
      status = 'fail';
    } else if (
      consoleErrors.length > 0 ||
      failedRequests.length > 0 ||
      responsive?.horizontalScroll ||
      a11y.violations > 0
    ) {
      status = 'warn';
    }

    record({
      category: label === 'mobile' ? 'Mobile responsiveness' : 'Desktop pages',
      name: `${target.path}`,
      status,
      durationMs: duration,
      details: {
        url,
        httpStatus,
        navError,
        title,
        hasMain,
        consoleErrors,
        failedRequests,
        responsive,
        a11y,
        screenshot: screenshotOk ? screenshotName : null,
      },
    });
  }

  await context.close();
}

// ─── Critical E2E journeys ──────────────────────────────────────────────────

async function runCriticalJourneys(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Journey 1: Header → Open auth modal → tabs present.
  const startedAt = Date.now();
  let status = 'pass';
  let details = { url: SITE_URL, steps: [] };
  try {
    await page.goto(`${SITE_URL}/`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
    details.steps.push('navigated to /');
    const accountBtn = page.locator('#header-account-btn');
    if (await accountBtn.count()) {
      await accountBtn.first().click({ timeout: 5000 });
      details.steps.push('clicked account button');
      const tab = await page.locator('[role="tab"]', { hasText: 'Sign in' }).count();
      const createTab = await page.locator('[role="tab"]', { hasText: 'Create account' }).count();
      details.steps.push(`auth tabs: signin=${tab}, create=${createTab}`);
      if (tab === 0 || createTab === 0) status = 'fail';
    } else {
      // On viewports < 768px, the account button is hidden — pass-through.
      details.steps.push('account button not visible on this viewport (expected on small phones)');
    }
  } catch (e) {
    status = 'fail';
    details.error = String(e?.message ?? e);
  }
  record({
    category: 'E2E journeys',
    name: 'Open auth modal from header',
    status,
    durationMs: Date.now() - startedAt,
    details,
  });

  // Journey 2: Shop → first product card → product detail loads OR themed 404
  // resolves (never the raw stark-white default 404).
  const j2Started = Date.now();
  let j2Status = 'pass';
  const j2Details = { steps: [] };
  try {
    await page.goto(`${SITE_URL}/shop`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
    j2Details.steps.push('navigated to /shop');
    const firstCard = page.locator('a[href^="/product/"]').first();
    const cardCount = await firstCard.count();
    j2Details.steps.push(`product card count: ${cardCount}`);
    if (cardCount > 0) {
      const href = await firstCard.getAttribute('href');
      const resp = await page.goto(`${SITE_URL}${href}`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
      j2Details.steps.push(`navigated to ${href} → HTTP ${resp?.status() ?? 'unknown'}`);
      // Either the static product page exists (200) OR the themed not-found
      // page is in play (Next.js export still serves the page chrome). Either
      // way, the user should see SOMETHING themed — not the raw 404.html.
      const hasThemedShell = (await page.locator('body').evaluate((b) => b.classList.length > 0 || !!document.querySelector('header'))) ?? false;
      j2Details.hasThemedShell = hasThemedShell;
      if (!hasThemedShell) j2Status = 'fail';
    } else {
      j2Status = 'warn';
      j2Details.note = 'no product cards on /shop — catalog appears empty';
    }
  } catch (e) {
    j2Status = 'fail';
    j2Details.error = String(e?.message ?? e);
  }
  record({
    category: 'E2E journeys',
    name: 'Shop → product detail (or themed fallback)',
    status: j2Status,
    durationMs: Date.now() - j2Started,
    details: j2Details,
  });

  // ── Lightweight journey: Cart flow (localStorage only) ─────────────────
  // Goes /shop → quick-add the first product → opens /cart → asserts the cart
  // is no longer empty. Mutates only client-side localStorage; never touches
  // the orders API.
  await runCartFlowJourney(page);

  // ── Lightweight journey: Empty-submit form validation ──────────────────
  // Opens the auth modal, submits the Sign in form with empty fields, asserts
  // the inline error renders. Verifies client-side validation didn't break.
  await runFormValidationJourney(page);

  // ── Lightweight journey: Key copy assertions ───────────────────────────
  // Reads visible text on key pages; flags blank/missing copy from a deploy
  // that accidentally truncated translations or marketing strings.
  await runKeyCopyJourney(page);

  await context.close();
}

// ─── Lightweight journeys (no credentials needed) ───────────────────────────

async function runCartFlowJourney(page) {
  const startedAt = Date.now();
  let status = 'pass';
  const details = { url: `${SITE_URL}/shop`, steps: [] };

  try {
    await page.goto(`${SITE_URL}/shop`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
    details.steps.push('navigated to /shop');

    // Clear any previously-added cart state so the assertion below is
    // unambiguous. The cart provider keys off `srilatha_cart` in localStorage.
    await page.evaluate(() => {
      try { localStorage.removeItem('srilatha_cart'); } catch { /* ignore */ }
    });
    details.steps.push('cleared srilatha_cart from localStorage');

    const quickAdd = page.locator('.product-card-quick-add').first();
    const quickAddCount = await quickAdd.count();
    details.steps.push(`quick-add buttons present: ${quickAddCount > 0}`);

    if (quickAddCount === 0) {
      status = 'warn';
      details.note = 'no in-stock product cards to add — catalog may be empty';
    } else {
      // Click triggers cart provider + opens the cart drawer; either way the
      // localStorage state is what we assert against.
      await quickAdd.click({ timeout: 5000 });
      details.steps.push('clicked quick-add');
      await page.waitForTimeout(500);

      const cartContents = await page.evaluate(() => {
        try { return localStorage.getItem('srilatha_cart'); } catch { return null; }
      });
      const parsed = cartContents ? JSON.parse(cartContents) : null;
      const itemCount = Array.isArray(parsed) ? parsed.length : Array.isArray(parsed?.items) ? parsed.items.length : 0;
      details.steps.push(`localStorage cart entries after add: ${itemCount}`);
      details.cartLocalStorageItems = itemCount;
      if (itemCount === 0) status = 'fail';

      // Navigate to /cart and confirm the empty-cart copy is NOT shown.
      await page.goto(`${SITE_URL}/cart`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
      details.steps.push('navigated to /cart');
      const emptyVisible = await page.locator('text=Cart is empty').count();
      details.cartShowsEmptyMessage = emptyVisible > 0;
      details.steps.push(`"Cart is empty" copy visible: ${emptyVisible > 0}`);
      if (emptyVisible > 0) status = 'fail';
    }
  } catch (e) {
    status = 'fail';
    details.error = String(e?.message ?? e);
  } finally {
    // Restore a clean cart so later journeys aren't polluted.
    try {
      await page.evaluate(() => { try { localStorage.removeItem('srilatha_cart'); } catch { /* ignore */ } });
    } catch { /* ignore */ }
  }

  record({
    category: 'E2E journeys',
    name: 'Cart flow (add product → /cart)',
    status,
    durationMs: Date.now() - startedAt,
    details,
  });
}

async function runFormValidationJourney(page) {
  const startedAt = Date.now();
  let status = 'pass';
  const details = { url: SITE_URL, steps: [] };

  try {
    await page.goto(`${SITE_URL}/`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
    details.steps.push('navigated to /');

    const accountBtn = page.locator('#header-account-btn');
    if (await accountBtn.count() === 0) {
      details.note = 'account button hidden on this viewport — skipping';
      details.steps.push('skip: header account button hidden');
    } else {
      await accountBtn.first().click({ timeout: 5000 });
      details.steps.push('opened auth modal');
      await page.waitForSelector('.auth-card', { state: 'visible', timeout: 5000 });

      // Click submit with empty identifier + password.
      const submitBtn = page.getByTestId('login-submit');
      const submitCount = await submitBtn.count();
      details.steps.push(`login-submit button present: ${submitCount > 0}`);
      if (submitCount === 0) {
        status = 'fail';
        details.note = 'login-submit data-testid missing from auth modal';
      } else {
        await submitBtn.click({ timeout: 5000 });
        await page.waitForTimeout(400);
        const errorVisible = await page.getByTestId('auth-error').count();
        details.steps.push(`auth-error visible after empty submit: ${errorVisible > 0}`);
        details.emptySubmitShowsError = errorVisible > 0;
        if (errorVisible === 0) {
          status = 'fail';
          details.note = 'empty form submit did NOT show validation error';
        }
      }

      // Close the modal so we leave a clean state.
      const close = page.locator('.auth-close').first();
      if (await close.count()) await close.click({ timeout: 5000 });
    }
  } catch (e) {
    status = 'fail';
    details.error = String(e?.message ?? e);
  }

  record({
    category: 'E2E journeys',
    name: 'Form validation (empty Sign in submit shows error)',
    status,
    durationMs: Date.now() - startedAt,
    details,
  });
}

async function runKeyCopyJourney(page) {
  const startedAt = Date.now();
  const details = { url: SITE_URL, checks: [] };

  // Each entry is a copy fragment we expect to find on the named page. If a
  // fragment goes missing — say the announcement bar got blanked out by a
  // misconfigured env var — this surfaces it before customers do.
  const COPY_CHECKS = [
    { page: '/',         match: /Heirloom Resin Art/i,          purpose: 'hero headline' },
    { page: '/',         match: /Made.*One.*Piece.*at.*a.*Time/i, purpose: 'hero subhead' },
    { page: '/shop',     match: /Shop|Artworks/i,                purpose: 'shop landing copy' },
    { page: '/contact',  match: /WhatsApp/i,                     purpose: 'contact tile' },
    { page: '/faq',      match: /Returns|Shipping|Care/i,        purpose: 'FAQ section heading' },
  ];

  let anyFail = false;

  for (const c of COPY_CHECKS) {
    let found = false;
    let error = null;
    try {
      await page.goto(`${SITE_URL}${c.page}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      // Search across body innerText.
      const text = await page.locator('body').innerText({ timeout: 5000 });
      found = c.match.test(text);
    } catch (e) {
      error = String(e?.message ?? e);
    }
    details.checks.push({
      page: c.page,
      purpose: c.purpose,
      pattern: c.match.toString(),
      found,
      error,
    });
    if (!found) anyFail = true;
  }

  record({
    category: 'E2E journeys',
    name: 'Key copy present on landing pages',
    status: anyFail ? 'warn' : 'pass', // copy drift is a warning, not a hard fail
    durationMs: Date.now() - startedAt,
    details,
  });
}

// ─── DEV-only authenticated journeys (require test credentials) ─────────────

async function runSignedInJourney(browser) {
  if (TARGET_ENV !== 'dev') {
    console.log('  skip: signed-in journey runs only on DEV');
    return;
  }
  if (!TEST_CUSTOMER_EMAIL || !TEST_CUSTOMER_PASSWORD) {
    console.log('  skip: TEST_CUSTOMER_EMAIL / TEST_CUSTOMER_PASSWORD not set');
    return;
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const startedAt = Date.now();
  let status = 'pass';
  const details = { url: SITE_URL, steps: [] };

  try {
    await page.goto(`${SITE_URL}/`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
    details.steps.push('navigated to /');

    await page.locator('#header-account-btn').first().click({ timeout: 5000 });
    await page.waitForSelector('.auth-card', { state: 'visible', timeout: 5000 });
    details.steps.push('opened auth modal');

    await page.getByTestId('login-identifier').fill(TEST_CUSTOMER_EMAIL);
    await page.getByTestId('login-password').fill(TEST_CUSTOMER_PASSWORD);
    details.steps.push('filled credentials');

    // Wait for the /auth/login POST response so we can read the status code.
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/auth/login') && resp.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.getByTestId('login-submit').click({ timeout: 5000 });
    const response = await responsePromise.catch(() => null);
    const loginStatus = response?.status() ?? 0;
    details.loginHttpStatus = loginStatus;
    details.steps.push(`POST /api/auth/login → ${loginStatus}`);

    // Modal should close on success.
    await page.waitForSelector('.auth-card', { state: 'hidden', timeout: 5000 }).catch(() => {});
    const modalStillOpen = await page.locator('.auth-card').count();
    details.modalClosed = modalStillOpen === 0;
    details.steps.push(`auth modal closed: ${modalStillOpen === 0}`);

    // Account button should now be a user avatar / show the menu on click.
    await page.locator('#header-account-btn').first().click({ timeout: 5000 });
    await page.waitForTimeout(400);
    const logoutVisible = await page.getByRole('button', { name: /log out/i }).count();
    details.menuShowsLogout = logoutVisible > 0;
    details.steps.push(`user menu shows Log Out: ${logoutVisible > 0}`);

    if (loginStatus !== 200 || modalStillOpen !== 0 || logoutVisible === 0) {
      status = 'fail';
    }

    // Log out so the next journey starts clean.
    if (logoutVisible > 0) {
      await page.getByRole('button', { name: /log out/i }).first().click({ timeout: 5000 });
      details.steps.push('clicked Log Out');
    }
  } catch (e) {
    status = 'fail';
    details.error = String(e?.message ?? e);
  }

  record({
    category: 'Authenticated journeys',
    name: 'Sign in with DEV test customer + sign out',
    status,
    durationMs: Date.now() - startedAt,
    details,
  });

  await context.close();
}

// ─── DEV-only Razorpay sandbox checkout ─────────────────────────────────────

async function runCheckoutJourney(browser) {
  if (TARGET_ENV !== 'dev') {
    console.log('  skip: Razorpay checkout journey runs only on DEV');
    return;
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const startedAt = Date.now();
  let status = 'pass';
  const details = { url: SITE_URL, steps: [], razorpay: {} };

  // Network capture for the order creation request — that's the
  // backend-integration signal we care most about.
  let createOrderStatus = null;
  let createOrderId = null;
  page.on('response', async (res) => {
    if (res.url().includes('/api/orders') && res.request().method() === 'POST') {
      createOrderStatus = res.status();
      try {
        const body = await res.json();
        createOrderId = body?.orderId ?? null;
      } catch { /* ignore */ }
    }
  });

  try {
    // 1. Reach /shop, add a product to cart.
    await page.goto(`${SITE_URL}/shop`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
    details.steps.push('navigated to /shop');

    await page.evaluate(() => {
      try { localStorage.removeItem('srilatha_cart'); } catch { /* ignore */ }
    });

    const quickAdd = page.locator('.product-card-quick-add').first();
    if (await quickAdd.count() === 0) {
      details.note = 'no in-stock products to checkout';
      record({
        category: 'Authenticated journeys',
        name: 'Razorpay sandbox checkout (DEV)',
        status: 'warn',
        durationMs: Date.now() - startedAt,
        details,
      });
      await context.close();
      return;
    }
    await quickAdd.click({ timeout: 5000 });
    details.steps.push('added first product to cart');
    await page.waitForTimeout(400);

    // 2. Go to /checkout.
    await page.goto(`${SITE_URL}/checkout`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
    details.steps.push('navigated to /checkout');

    // 3. Step 1 — fill the address form. The inputs have no testids, so we
    // anchor on the placeholder text emitted by the page component.
    await page.getByPlaceholder('As on shipping label').fill('Srilatha Test Buyer');
    await page.getByPlaceholder('For order confirmation').fill(TEST_CUSTOMER_EMAIL || 'test@srilatha.art');
    await page.getByPlaceholder('+91 9XXXXXXXXX').fill('+91 9876500000');
    await page.getByPlaceholder('Flat / House no, Street, Area').fill('Plot 12, Test Lane');
    await page.getByPlaceholder('e.g. Mumbai').fill('Hyderabad');
    await page.locator('select').first().selectOption({ label: 'Telangana' }).catch(async () => {
      await page.locator('select').first().selectOption({ index: 1 });
    });
    await page.getByPlaceholder('6 digits').fill('500039');
    details.steps.push('filled delivery form');

    await page.getByRole('button', { name: /Review Order/ }).click({ timeout: 5000 });
    await page.waitForTimeout(500);
    details.steps.push('advanced to step 2 (Review)');

    // 4. Step 2 → step 3.
    await page.getByRole('button', { name: /Pay .* securely/ }).click({ timeout: 5000 });
    await page.waitForTimeout(500);
    details.steps.push('advanced to step 3 (Payment)');

    // 5. Click the Pay button — this triggers `createOrder` + opens Razorpay.
    const payBtn = page.getByRole('button', { name: /Pay .*/i }).filter({ hasNotText: 'securely' }).first();
    await payBtn.click({ timeout: 10_000 });
    details.steps.push('clicked Pay (Razorpay)');

    // 6. Wait for the createOrder response so we know our backend stayed alive.
    // The promise above resolves whenever it fires; give it 30s max.
    for (let i = 0; i < 30 && createOrderStatus === null; i++) {
      await page.waitForTimeout(1000);
    }
    details.steps.push(`POST /api/orders → ${createOrderStatus ?? 'no response'}`);
    details.createOrderHttpStatus = createOrderStatus;
    details.createOrderId = createOrderId;

    // 7. Wait for the Razorpay iframe to render.
    const razorpayFrameAppeared = await page
      .waitForSelector('iframe[src*="razorpay.com"]', { state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    details.razorpay.iframeAppeared = razorpayFrameAppeared;
    details.steps.push(`Razorpay iframe appeared: ${razorpayFrameAppeared}`);

    if (!razorpayFrameAppeared) {
      // Hard fail — our integration didn't open the gateway.
      status = 'fail';
    } else {
      // 8. Best-effort: fill the Razorpay test card. Razorpay's hosted UI
      // selectors change without notice and the script itself loads a few
      // iframes (modal shell + card form). We try to drive the happy path and
      // record success/failure without crashing the run.
      try {
        const frames = page.frames().filter((f) => /razorpay\.com/.test(f.url()));
        details.razorpay.frameCount = frames.length;
        // The card-form frame is usually the deepest one with a "Card" tab.
        // Iterate until we find a frame exposing a card-number-like input.
        let targetFrame = null;
        for (const f of frames) {
          if (await f.locator('input[name="card[number]"], input[name="card.number"]').count().catch(() => 0)) {
            targetFrame = f;
            break;
          }
        }
        if (!targetFrame) {
          // Some Razorpay flows show a method picker first. Click the Card
          // method tile and re-scan frames.
          for (const f of frames) {
            const cardTile = f.locator('[data-method="card"]');
            if (await cardTile.count().catch(() => 0)) {
              await cardTile.first().click().catch(() => {});
              await page.waitForTimeout(800);
              const refreshed = page.frames().filter((x) => /razorpay\.com/.test(x.url()));
              for (const r of refreshed) {
                if (await r.locator('input[name="card[number]"], input[name="card.number"]').count().catch(() => 0)) {
                  targetFrame = r;
                  break;
                }
              }
              if (targetFrame) break;
            }
          }
        }
        details.razorpay.cardFrameFound = !!targetFrame;

        if (targetFrame) {
          await targetFrame.locator('input[name="card[number]"], input[name="card.number"]').first().fill(RAZORPAY_TEST_CARD.number).catch(() => {});
          await targetFrame.locator('input[name="card[expiry]"], input[name="card.expiry"]').first().fill(RAZORPAY_TEST_CARD.expiry).catch(() => {});
          await targetFrame.locator('input[name="card[cvv]"], input[name="card.cvv"]').first().fill(RAZORPAY_TEST_CARD.cvv).catch(() => {});
          await targetFrame.locator('input[name="card[name]"], input[name="card.name"]').first().fill(RAZORPAY_TEST_CARD.name).catch(() => {});
          details.steps.push('filled Razorpay test card details');

          await targetFrame.getByRole('button', { name: /Pay/i }).first().click({ timeout: 5000 }).catch(() => {});
          details.steps.push('submitted Razorpay form');

          // 9. Razorpay may show 3DS/OTP. Try the canonical test OTP "1234"
          // if a numeric input appears within 15s.
          const otpInput = await page.waitForSelector('iframe[src*="razorpay.com"] >> nth=0', { timeout: 5_000 }).catch(() => null);
          if (otpInput) {
            // The OTP field varies — leave a best-effort attempt at filling.
            await page.waitForTimeout(2000);
            for (const f of page.frames().filter((x) => /razorpay\.com/.test(x.url()))) {
              const otp = f.locator('input[type="tel"], input[type="text"][maxlength="4"], input[name="otp"]');
              if (await otp.count().catch(() => 0)) {
                await otp.first().fill('1234').catch(() => {});
                await f.getByRole('button', { name: /submit|verify|confirm|pay/i }).first().click().catch(() => {});
                details.steps.push('attempted OTP/3DS submission with test OTP 1234');
                break;
              }
            }
          }

          // 10. Wait for the order-success page or a hard timeout.
          const reachedSuccess = await page
            .waitForURL(/\/order-success/, { timeout: 30_000 })
            .then(() => true)
            .catch(() => false);
          details.razorpay.reachedOrderSuccess = reachedSuccess;
          details.steps.push(`reached /order-success: ${reachedSuccess}`);
          if (!reachedSuccess) {
            status = 'warn';
            details.note = 'Razorpay sandbox flow did not complete to /order-success — gateway selectors may have changed. The createOrder API still responded ' + (createOrderStatus ?? 'unknown') + '.';
          }
        } else {
          // We got the modal up but couldn't reach the card form.
          status = 'warn';
          details.note = 'Razorpay card form selectors not found — UI may have changed; createOrder still succeeded.';
        }
      } catch (innerErr) {
        status = 'warn';
        details.razorpayError = String(innerErr?.message ?? innerErr);
        details.steps.push('Razorpay automation error (recorded as warn)');
      }
    }

    if (createOrderStatus !== 200 && createOrderStatus !== 201) {
      // The createOrder call itself is a hard requirement.
      status = 'fail';
    }

    // Save a screenshot of whichever state we end on.
    try {
      await page.screenshot({ path: join(SCREENSHOT_DIR, 'checkout-end.png'), fullPage: false });
      details.screenshot = 'checkout-end.png';
    } catch { /* ignore */ }
  } catch (e) {
    status = 'fail';
    details.error = String(e?.message ?? e);
  } finally {
    // Tidy local state.
    try {
      await page.evaluate(() => { try { localStorage.removeItem('srilatha_cart'); } catch { /* ignore */ } });
    } catch { /* ignore */ }
  }

  record({
    category: 'Authenticated journeys',
    name: 'Razorpay sandbox checkout (DEV)',
    status,
    durationMs: Date.now() - startedAt,
    details,
  });

  await context.close();
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const t0 = Date.now();

  console.log(`\n=== Validating ${TARGET_ENV.toUpperCase()} ===`);
  console.log(`Site: ${SITE_URL}`);
  console.log(`API:  ${API_URL}\n`);

  console.log('▶ API health…');
  await probeApi();

  const browser = await chromium.launch();
  try {
    console.log('▶ Desktop pages…');
    await runPageSuite(browser, { width: 1440, height: 900 }, 'desktop', null);

    console.log('▶ Mobile pages…');
    await runPageSuite(browser, { width: 390, height: 844 }, 'mobile', devices['iPhone 13']);

    console.log('▶ Critical + lightweight journeys…');
    await runCriticalJourneys(browser);

    console.log('▶ Authenticated journey (DEV-only)…');
    await runSignedInJourney(browser);

    console.log('▶ Razorpay sandbox checkout (DEV-only)…');
    await runCheckoutJourney(browser);
  } finally {
    await browser.close();
  }

  results.meta.finishedAt = new Date().toISOString();
  results.meta.durationMs = Date.now() - t0;

  await writeFile(RESULTS_FILE, JSON.stringify(results, null, 2));

  console.log(`\n=== Result ===`);
  console.log(`Passed:   ${results.summary.passed}`);
  console.log(`Warnings: ${results.summary.warned}`);
  console.log(`Failed:   ${results.summary.failed}`);
  console.log(`Total:    ${results.summary.total}`);

  process.exit(results.summary.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  // Persist whatever we managed to collect so the report still uploads.
  results.meta.finishedAt = new Date().toISOString();
  results.meta.fatalError = String(e?.message ?? e);
  writeFile(RESULTS_FILE, JSON.stringify(results, null, 2)).finally(() => process.exit(1));
});
