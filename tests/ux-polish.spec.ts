import { test, devices, type Page } from '@playwright/test';
import path from 'path';

const OUT = 'c:/tmp/srilatha-ux-review/polish';
const BASE = 'http://localhost:3100';

async function shoot(page: Page, file: string) {
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
}

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

test('polish desktop home top', async ({ page }) => {
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1000);
  await shoot(page, 'desktop__home-top.png');
});

test('polish desktop contact', async ({ page }) => {
  await page.goto(BASE + '/contact', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1000);
  await shoot(page, 'desktop__contact.png');
});

test.describe('mobile', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    userAgent: devices['iPhone 13'].userAgent,
    deviceScaleFactor: 2,
  });
  test('polish mobile home top', async ({ page }) => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(1500);
    await shoot(page, 'mobile__home-top.png');
  });
});
