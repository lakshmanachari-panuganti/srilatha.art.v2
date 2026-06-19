import { test, expect, Page, Route } from '@playwright/test';

const API_BASE = 'http://localhost:7099/api';

/**
 * Mocked customer store + login + reset-OTP audit. Lives inside the Playwright
 * process so tests stay hermetic — no backend, no Azurite, no WhatsApp calls.
 */
interface MockUser {
  email: string;
  name: string;
  mobile?: string;
  password?: string;
  provider: 'email' | 'google' | 'email+google';
}

interface MockState {
  users: Map<string, MockUser>;
  phoneIndex: Map<string, string>;
  loginAudit: { userId: string; method: string; ts: string }[];
  resetAudit: { phone: string; action: string; ts: string }[];
  otp: Map<string, { code: string; attempts: number; sent: number; expiresAt: number }>;
  resetTokens: Map<string, string>; // token -> email
}

function newState(): MockState {
  return {
    users: new Map(),
    phoneIndex: new Map(),
    loginAudit: [],
    resetAudit: [],
    otp: new Map(),
    resetTokens: new Map(),
  };
}

function normalizePhone(p?: string): string {
  if (!p) return '';
  const digits = p.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (p.trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+${digits}`;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function findByIdentifier(state: MockState, ident: string): MockUser | undefined {
  if (!ident) return undefined;
  if (ident.includes('@')) return state.users.get(ident.toLowerCase());
  const email = state.phoneIndex.get(normalizePhone(ident));
  return email ? state.users.get(email) : undefined;
}

async function readJson(route: Route): Promise<Record<string, any>> {
  try {
    return JSON.parse(route.request().postData() ?? '{}');
  } catch {
    return {};
  }
}

async function installAuthMocks(page: Page, state: MockState) {
  await page.route(`${API_BASE}/auth/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/auth/, '');
    const body = await readJson(route);

    if (path === '/register') {
      const email = String(body.email ?? '').toLowerCase().trim();
      const phone = body.mobile ? normalizePhone(body.mobile) : undefined;
      if (state.users.has(email)) {
        return route.fulfill(jsonResponse({ error: 'An account with this email already exists. Try signing in.' }, 409));
      }
      if (phone && state.phoneIndex.has(phone)) {
        return route.fulfill(jsonResponse({ error: 'An account with this phone number already exists. Try signing in.' }, 409));
      }
      const user: MockUser = {
        email,
        name: String(body.name ?? '').trim(),
        mobile: phone,
        password: String(body.password ?? ''),
        provider: 'email',
      };
      state.users.set(email, user);
      if (phone) state.phoneIndex.set(phone, email);
      state.loginAudit.push({ userId: email, method: 'email-password', ts: new Date().toISOString() });
      return route.fulfill(jsonResponse({
        token: `mock-token-${email}`,
        expiresIn: 3600,
        user: { email, name: user.name, mobile: user.mobile },
      }));
    }

    if (path === '/login') {
      const ident = String(body.identifier ?? body.email ?? body.phone ?? '');
      const password = String(body.password ?? '');
      const user = findByIdentifier(state, ident);
      if (!user || user.password !== password) {
        return route.fulfill(jsonResponse({ error: 'Invalid credentials.' }, 401));
      }
      state.loginAudit.push({ userId: user.email, method: 'email-password', ts: new Date().toISOString() });
      return route.fulfill(jsonResponse({
        token: `mock-token-${user.email}`,
        expiresIn: 3600,
        user: { email: user.email, name: user.name, mobile: user.mobile },
      }));
    }

    if (path === '/google') {
      const profile = body.profile ?? { email: 'g.user@example.com', name: 'Google User' };
      const email = String(profile.email).toLowerCase();
      const existed = state.users.get(email);
      const user: MockUser = existed
        ? { ...existed, provider: existed.provider === 'email' ? 'email+google' : 'google' }
        : { email, name: profile.name ?? email, provider: 'google' };
      state.users.set(email, user);
      state.loginAudit.push({ userId: email, method: 'google', ts: new Date().toISOString() });
      return route.fulfill(jsonResponse({
        token: `mock-token-${email}`,
        expiresIn: 3600,
        user: { email, name: user.name, mobile: user.mobile },
        created: !existed,
        merged: !!existed,
      }));
    }

    if (path === '/forgot-password/request') {
      const phone = normalizePhone(body.phone);
      state.resetAudit.push({ phone, action: 'request', ts: new Date().toISOString() });
      const email = state.phoneIndex.get(phone);
      if (!email) {
        // Do not leak — return ok regardless.
        return route.fulfill(jsonResponse({ ok: true, validityMinutes: 15 }));
      }
      const code = '123456';
      state.otp.set(phone, {
        code,
        attempts: 0,
        sent: (state.otp.get(phone)?.sent ?? 0) + 1,
        expiresAt: Date.now() + 15 * 60 * 1000,
      });
      return route.fulfill(jsonResponse({ ok: true, validityMinutes: 15, devOtp: code }));
    }

    if (path === '/forgot-password/verify') {
      const phone = normalizePhone(body.phone);
      const otp = String(body.otp ?? '');
      const stored = state.otp.get(phone);
      state.resetAudit.push({ phone, action: 'verify-attempt', ts: new Date().toISOString() });
      if (!stored || stored.expiresAt < Date.now() || stored.attempts >= 5) {
        return route.fulfill(jsonResponse({ error: 'Invalid or expired OTP.' }, 400));
      }
      if (stored.code !== otp) {
        stored.attempts += 1;
        return route.fulfill(jsonResponse({ error: 'Invalid or expired OTP.' }, 400));
      }
      const email = state.phoneIndex.get(phone)!;
      const token = `reset-${email}-${Date.now()}`;
      state.resetTokens.set(token, email);
      state.resetAudit.push({ phone, action: 'verify', ts: new Date().toISOString() });
      return route.fulfill(jsonResponse({ ok: true, resetToken: token, expiresIn: 600 }));
    }

    if (path === '/forgot-password/reset') {
      const token = String(body.resetToken ?? '');
      const newPw = String(body.newPassword ?? '');
      const email = state.resetTokens.get(token);
      if (!email || newPw.length < 8) {
        return route.fulfill(jsonResponse({ error: 'Reset session expired. Please start again.' }, 401));
      }
      const user = state.users.get(email)!;
      user.password = newPw;
      state.resetTokens.delete(token);
      state.resetAudit.push({ phone: user.mobile ?? '', action: 'reset', ts: new Date().toISOString() });
      state.loginAudit.push({ userId: email, method: 'otp-reset', ts: new Date().toISOString() });
      return route.fulfill(jsonResponse({
        ok: true,
        token: `mock-token-${email}`,
        expiresIn: 3600,
        user: { email, name: user.name, mobile: user.mobile },
      }));
    }

    return route.continue();
  });
}

async function openAuthModal(page: Page) {
  await page.goto('/');
  // header-account-btn opens the auth modal when no user is logged in
  await page.locator('#header-account-btn').click();
  await expect(page.locator('.auth-card')).toBeVisible();
}

test.describe('Customer auth — register, login, forgot password', () => {
  test('user can register, then sign in with email AND with phone', async ({ page }) => {
    const state = newState();
    await installAuthMocks(page, state);

    // 1) Register
    await openAuthModal(page);
    await page.getByRole('tab', { name: 'Create account' }).click();
    await page.getByTestId('register-name').fill('Test User');
    await page.getByTestId('register-email').fill('user1@example.com');
    await page.getByTestId('register-password').fill('Sup3rSecret!');
    await page.getByTestId('register-confirm').fill('Sup3rSecret!');
    await page.getByTestId('register-mobile').fill('+91 98765 43210');
    await page.getByTestId('register-submit').click();

    // Modal closes on success
    await expect(page.locator('.auth-card')).toBeHidden();
    expect(state.users.get('user1@example.com')).toBeTruthy();
    expect(state.loginAudit.at(-1)?.method).toBe('email-password');
    expect(state.phoneIndex.get('+919876543210')).toBe('user1@example.com');

    // 2) Sign out (clear token directly to reset session state)
    await page.evaluate(() => localStorage.removeItem('google_auth_token'));
    await page.reload();

    // 3) Sign in with phone
    await openAuthModal(page);
    await page.getByTestId('login-identifier').fill('9876543210');
    await page.getByTestId('login-password').fill('Sup3rSecret!');
    await page.getByTestId('login-submit').click();
    await expect(page.locator('.auth-card')).toBeHidden();
    expect(state.loginAudit.filter((e) => e.userId === 'user1@example.com').length).toBeGreaterThanOrEqual(2);

    // 4) Sign in with email
    await page.evaluate(() => localStorage.removeItem('google_auth_token'));
    await page.reload();
    await openAuthModal(page);
    await page.getByTestId('login-identifier').fill('user1@example.com');
    await page.getByTestId('login-password').fill('Sup3rSecret!');
    await page.getByTestId('login-submit').click();
    await expect(page.locator('.auth-card')).toBeHidden();
  });

  test('login with bad credentials shows an error', async ({ page }) => {
    const state = newState();
    state.users.set('person@example.com', { email: 'person@example.com', name: 'P', password: 'correct1!', provider: 'email' });
    await installAuthMocks(page, state);

    await openAuthModal(page);
    await page.getByTestId('login-identifier').fill('person@example.com');
    await page.getByTestId('login-password').fill('wrong-password');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('auth-error')).toContainText(/invalid/i);
  });

  test('forgot password — WhatsApp OTP flow resets and signs in', async ({ page }) => {
    const state = newState();
    state.users.set('reset@example.com', {
      email: 'reset@example.com',
      name: 'Reset User',
      mobile: '+919999988888',
      password: 'old-password-1',
      provider: 'email',
    });
    state.phoneIndex.set('+919999988888', 'reset@example.com');
    await installAuthMocks(page, state);

    await openAuthModal(page);
    await page.getByTestId('forgot-password-link').click();

    // Step 1 — request OTP
    await page.getByTestId('forgot-phone').fill('+91 99999 88888');
    await page.getByTestId('forgot-request-submit').click();
    await expect(page.getByTestId('auth-info')).toContainText(/15 minutes/i);
    expect(state.resetAudit.some((e) => e.action === 'request')).toBe(true);
    expect(state.otp.has('+919999988888')).toBe(true);

    // Step 2 — wrong OTP rejected, right OTP accepted
    await page.getByTestId('forgot-otp').fill('000000');
    await page.getByTestId('forgot-verify-submit').click();
    await expect(page.getByTestId('auth-error')).toContainText(/invalid|expired/i);

    await page.getByTestId('forgot-otp').fill('');
    await page.getByTestId('forgot-otp').fill('123456');
    await page.getByTestId('forgot-verify-submit').click();
    await expect(page.getByTestId('auth-info')).toContainText(/OTP verified/i);

    // Step 3 — set new password
    await page.getByTestId('forgot-new-password').fill('Brand-New-Pwd-1');
    await page.getByTestId('forgot-confirm-password').fill('Brand-New-Pwd-1');
    await page.getByTestId('forgot-reset-submit').click();
    await expect(page.locator('.auth-card')).toBeHidden();

    expect(state.resetAudit.some((e) => e.action === 'reset')).toBe(true);
    expect(state.loginAudit.at(-1)?.method).toBe('otp-reset');
    expect(state.users.get('reset@example.com')?.password).toBe('Brand-New-Pwd-1');
  });

  test('forgot password — unknown phone does not leak that no account exists', async ({ page }) => {
    const state = newState();
    await installAuthMocks(page, state);

    await openAuthModal(page);
    await page.getByTestId('forgot-password-link').click();
    await page.getByTestId('forgot-phone').fill('+91 12345 67890');
    await page.getByTestId('forgot-request-submit').click();
    // Same success message either way.
    await expect(page.getByTestId('auth-info')).toContainText(/15 minutes/i);
    expect(state.otp.size).toBe(0);
  });
});
