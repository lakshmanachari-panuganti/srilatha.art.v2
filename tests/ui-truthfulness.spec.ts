import { test, expect, Page, Route } from '@playwright/test';

/**
 * Truthfulness audit — every user-facing success / status message must be
 * backed by a verified backend outcome. The mocks in this file intentionally
 * vary the backend response shape so we can prove the UI reflects it.
 *
 * Test conditions covered:
 *   1. OTP "we've sent ..." text only when the backend reports sent=true.
 *   2. OTP fallback ("pre-filled") text when the backend exposed devOtp
 *      because the operator's send didn't happen.
 *   3. OTP failure (backend 503) stays on the phone step and surfaces the
 *      exact error — no advance to a verification step the user can't finish.
 *   4. Custom-order form actually hits POST /custom-orders. A 500 keeps the
 *      user on the form and shows the real error. Success only flips when
 *      the backend confirms.
 *   5. Custom-order success page only shows "Acknowledgement sent to ..."
 *      when emailSent=true and shows the email-failure warning otherwise.
 *   6. Order-success page mirrors the verifyPayment response via URL params.
 *   7. NewsletterForm and Footer subscribe never display a fake success.
 */

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

async function openAuthModal(page: Page) {
  await page.goto('/');
  await page.locator('#header-account-btn').click();
  await expect(page.locator('.auth-card')).toBeVisible();
}

async function gotoForgot(page: Page) {
  await openAuthModal(page);
  await page.getByTestId('forgot-password-link').click();
}

// ---------------------------------------------------------------------------
// 1. OTP "sent via WhatsApp" only when backend reports sent=true
// ---------------------------------------------------------------------------
test.describe('OTP truthfulness — request step', () => {
  test('claims WhatsApp delivery only when backend confirms sent=true', async ({ page }) => {
    await page.route(`**/api/auth/forgot-password/request`, (route) =>
      route.fulfill(jsonResponse({ ok: true, sent: true, validityMinutes: 15 })),
    );

    await gotoForgot(page);
    await page.getByTestId('forgot-phone').fill('+91 99999 88888');
    await page.getByTestId('forgot-request-submit').click();

    const info = page.getByTestId('auth-info');
    await expect(info).toContainText(/sent a 6-digit OTP via WhatsApp/i);
    await expect(info).toContainText(/15 minutes/i);
  });

  test('shows "pre-filled" wording when devOtp present and sent=false', async ({ page }) => {
    await page.route(`**/api/auth/forgot-password/request`, (route) =>
      route.fulfill(
        jsonResponse({ ok: true, sent: false, devOtp: '654321', validityMinutes: 15 }),
      ),
    );

    await gotoForgot(page);
    await page.getByTestId('forgot-phone').fill('+91 99999 88888');
    await page.getByTestId('forgot-request-submit').click();

    const info = page.getByTestId('auth-info');
    await expect(info).toContainText(/pre-filled/i);
    // It must NOT claim a WhatsApp send happened.
    await expect(info).not.toContainText(/sent a 6-digit OTP via WhatsApp/i);
    // The fallback code is pre-filled into the input.
    await expect(page.getByTestId('forgot-otp')).toHaveValue('654321');
  });

  test('backend 503 keeps user on the phone step and surfaces the exact error', async ({ page }) => {
    await page.route(`**/api/auth/forgot-password/request`, (route) =>
      route.fulfill(
        jsonResponse(
          { error: 'WhatsApp delivery is not configured on this server, so we couldn\'t send the OTP. Please contact support to reset your password.' },
          503,
        ),
      ),
    );

    await gotoForgot(page);
    await page.getByTestId('forgot-phone').fill('+91 99999 88888');
    await page.getByTestId('forgot-request-submit').click();

    await expect(page.getByTestId('auth-error')).toContainText(/not configured/i);
    // OTP step input must not be visible — we must not advance.
    await expect(page.getByTestId('forgot-otp')).toHaveCount(0);
    // The "We've sent ..." text must NOT appear anywhere on the page.
    await expect(page.getByText(/sent a 6-digit OTP via WhatsApp/i)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 4 + 5. Custom-order form: real POST, real error surfacing, email status
// ---------------------------------------------------------------------------
test.describe('Custom-order truthfulness', () => {
  async function fillForm(page: Page) {
    await page.goto('/custom-order');
    await page.fill('[name="name"]', 'Truthful Tester');
    await page.fill('[name="email"]', 'tester@example.com');
    await page.fill('[name="phone"]', '+91 90000 11111');
    await page.selectOption('[name="artType"]', { index: 1 });
    await page.selectOption('[name="budget"]', { index: 1 });
    await page.fill(
      '[name="description"]',
      'A bespoke resin piece in deep blue with gold inlay celebrating an anniversary.',
    );
    await page.check('[name="agreeTerms"]');
  }

  test('actually POSTs to /custom-orders (no faked delay)', async ({ page }) => {
    let calls = 0;
    await page.route(`**/api/custom-orders`, (route) => {
      calls += 1;
      route.fulfill(
        jsonResponse(
          {
            success: true,
            id: 'CO-12345',
            message: 'received',
            emailSent: true,
            emailTo: 'tester@example.com',
          },
          201,
        ),
      );
    });

    await fillForm(page);
    await page.getByRole('button', { name: /submit commission request/i }).click();
    await expect(page.getByText(/commission request received/i)).toBeVisible();
    expect(calls).toBe(1);
  });

  test('500 keeps user on form and shows the real error', async ({ page }) => {
    await page.route(`**/api/custom-orders`, (route) =>
      route.fulfill(
        jsonResponse({ error: 'Storage backend is unavailable. Please try again shortly.' }, 500),
      ),
    );

    await fillForm(page);
    await page.getByRole('button', { name: /submit commission request/i }).click();

    // Filter out Next.js's empty route-announcer alert.
    await expect(
      page.getByRole('alert').filter({ hasText: /storage backend is unavailable/i }),
    ).toBeVisible();
    // Success view must not appear.
    await expect(page.getByText(/commission request received/i)).toHaveCount(0);
  });

  test('success view shows "Acknowledgement sent" only when emailSent=true', async ({ page }) => {
    await page.route(`**/api/custom-orders`, (route) =>
      route.fulfill(
        jsonResponse(
          {
            success: true,
            id: 'CO-77777',
            message: 'received',
            emailSent: true,
            emailTo: 'tester@example.com',
          },
          201,
        ),
      ),
    );

    await fillForm(page);
    await page.getByRole('button', { name: /submit commission request/i }).click();

    await expect(page.getByTestId('co-email-sent')).toContainText(/acknowledgement sent/i);
    await expect(page.getByTestId('co-email-failed')).toHaveCount(0);
  });

  test('success view shows email-failure warning when emailSent=false', async ({ page }) => {
    await page.route(`**/api/custom-orders`, (route) =>
      route.fulfill(
        jsonResponse(
          {
            success: true,
            id: 'CO-88888',
            message: 'received',
            emailSent: false,
            emailTo: 'tester@example.com',
            emailError: 'connect ECONNREFUSED 127.0.0.1:587',
            emailErrorReason: 'smtp-error',
          },
          201,
        ),
      ),
    );

    await fillForm(page);
    await page.getByRole('button', { name: /submit commission request/i }).click();

    const warn = page.getByTestId('co-email-failed');
    await expect(warn).toContainText(/couldn.{1,3}t send the acknowledgement email/i);
    await expect(warn).toContainText(/ECONNREFUSED/);
    await expect(page.getByTestId('co-email-sent')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Order-success page mirrors verifyPayment response via URL params
// ---------------------------------------------------------------------------
test.describe('Order-success truthfulness', () => {
  test('shows email-sent line only when ?emailSent=1', async ({ page }) => {
    await page.goto('/order-success?orderId=ORD-1&paymentId=pay_1&emailSent=1&emailTo=buyer@example.com');
    await expect(page.getByTestId('email-sent')).toContainText('buyer@example.com');
    await expect(page.getByTestId('email-failed')).toHaveCount(0);
  });

  test('shows email-failure warning when ?emailSent=0', async ({ page }) => {
    await page.goto(
      '/order-success?orderId=ORD-2&paymentId=pay_2&emailSent=0&emailTo=buyer@example.com&emailError=' +
        encodeURIComponent('connect ECONNREFUSED 127.0.0.1:587'),
    );
    await expect(page.getByTestId('email-failed')).toContainText(/couldn.{1,3}t send the confirmation email/i);
    await expect(page.getByTestId('email-failed')).toContainText(/ECONNREFUSED/);
    await expect(page.getByTestId('email-sent')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Newsletter forms never show fake success
// ---------------------------------------------------------------------------
test.describe('Newsletter forms do not lie', () => {
  test('homepage NewsletterForm shows "coming soon" not fake success', async ({ page }) => {
    await page.goto('/');
    // It should not have a form that pretends to subscribe.
    await expect(page.getByText(/newsletter coming soon/i).first()).toBeVisible();
    // And the old fake-success text must be gone everywhere.
    await expect(page.getByText(/you.{1,3}re in! check your inbox/i)).toHaveCount(0);
    await expect(page.getByText(/your 10% discount code is on its way/i)).toHaveCount(0);
  });

  test('Footer subscribe never fires an alert claiming subscription', async ({ page }) => {
    let alerted = false;
    page.on('dialog', (d) => {
      alerted = true;
      void d.dismiss();
    });
    await page.goto('/');
    // Footer "subscribe" alert is gone — it should now be a WhatsApp link.
    await expect(page.getByText(/want first dibs on new pieces/i)).toBeVisible();
    // Wait a tick to ensure no alert is fired.
    await page.waitForTimeout(250);
    expect(alerted).toBe(false);
  });
});
