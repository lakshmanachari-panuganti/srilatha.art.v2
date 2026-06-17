import { test, devices, type Page } from '@playwright/test';
import path from 'path';

const OUT = 'c:/tmp/srilatha-ux-review/shots';
const BASE = 'https://orange-forest-042a5df00.7.azurestaticapps.net';

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

async function shoot(page: Page, file: string, full = true) {
  await page.screenshot({ path: path.join(OUT, file), fullPage: full });
}

test.describe.configure({ mode: 'serial' });

for (const vp of [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false },
  { name: 'mobile',  viewport: { width: 390,  height: 844 }, isMobile: true, ua: devices['iPhone 13'].userAgent },
] as const) {
  test.describe(`${vp.name}`, () => {
    test.use({
      viewport: vp.viewport,
      isMobile: vp.isMobile,
      deviceScaleFactor: 2,
      baseURL: BASE,
      ...(vp.isMobile && 'ua' in vp ? { userAgent: vp.ua } : {}),
    });

    for (const p of PAGES) {
      test(`${vp.name} ${p.name}`, async ({ page }) => {
        await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(1500);
        await shoot(page, `${vp.name}__${p.name}.png`);
      });
    }

    test(`${vp.name} auth`, async ({ page }) => {
      await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(800);
      if (vp.isMobile) {
        const hamburger = page.locator('.hamburger-btn').first();
        if (await hamburger.isVisible()) {
          await hamburger.click();
          await page.waitForTimeout(500);
          await shoot(page, `${vp.name}__hamburger-drawer.png`, false);
        }
      } else {
        const btn = page.locator('#header-account-btn');
        if (await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(500);
          await shoot(page, `${vp.name}__auth-modal-signin.png`, false);
          try {
            await page.getByRole('tab', { name: 'Create account' }).click({ timeout: 5000 });
            await page.waitForTimeout(300);
            await shoot(page, `${vp.name}__auth-modal-register.png`, false);
          } catch {}
        }
      }
    });

    test(`${vp.name} product-detail`, async ({ page }) => {
      await page.goto(BASE + '/shop', { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1500);
      const card = page.locator('a[href^="/product/"]').first();
      if (await card.count()) {
        const href = await card.getAttribute('href');
        await page.goto(BASE + href!, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(1500);
        await shoot(page, `${vp.name}__product-detail.png`);
      }
    });
  });
}
