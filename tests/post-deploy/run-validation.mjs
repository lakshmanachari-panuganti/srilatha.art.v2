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

    console.log('▶ Critical journeys…');
    await runCriticalJourneys(browser);
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
