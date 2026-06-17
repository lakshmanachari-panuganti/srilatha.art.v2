import { test } from '@playwright/test';
import path from 'path';

const OUT = 'c:/tmp/srilatha-ux-review/shots';
const BASE = 'https://orange-forest-042a5df00.7.azurestaticapps.net';

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

test('home sections desktop', async ({ page }) => {
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2000);

  const totalHeight: number = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = 900;
  let i = 0;
  for (let y = 0; y < totalHeight; y += step) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(OUT, `desktop__home-section-${String(i).padStart(2, '0')}.png`),
      fullPage: false,
    });
    i++;
  }
});
