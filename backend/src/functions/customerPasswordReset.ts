import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomInt, randomUUID } from 'crypto';
import { ensureTable, getEntity, upsertEntity } from '../utils/tableStorage';
import {
  findCustomerByPhone,
  findCustomerByEmail,
  setPasswordHash,
  updateLastLogin,
} from '../utils/customerStore';
import { normalizePhone, phoneRowKey } from '../utils/identifiers';
import { recordLogin, recordPasswordResetEvent } from '../utils/auditLog';
import { sendWhatsApp, buildPasswordResetOtpMessage } from './whatsapp';
import { issueCustomerToken } from './customerAuth';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const OTP_TABLE = 'passwordResetOtp';
const OTP_VALIDITY_MIN = 15;
const OTP_VALIDITY_MS = OTP_VALIDITY_MIN * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const MAX_OTPS_PER_WINDOW = 3;
const SEND_COOLDOWN_MS = 60 * 1000;
const RESET_TOKEN_TTL_SECONDS = 10 * 60; // 10 min to use the token after verify

const JWT_SECRET = process.env.JWT_SECRET ?? '';
const RESET_TOKEN_PURPOSE = 'password-reset';
const EXPOSE_OTP = process.env.EXPOSE_OTP_FOR_TESTING === 'true';

interface OtpEntity {
  partitionKey: 'phone';
  rowKey: string;            // digits-only phone
  email: string;
  otpHash: string;
  expiresAt: string;
  attempts: number;
  sentCount: number;
  windowStartedAt: string;
  lastSentAt: string;
  used: boolean;
}

function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
function optionsResponse(): HttpResponseInit {
  return { status: 204, headers: CORS_HEADERS };
}

function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

async function loadOtp(phone: string): Promise<OtpEntity | null> {
  await ensureTable(OTP_TABLE);
  return getEntity<OtpEntity>(OTP_TABLE, 'phone', phoneRowKey(phone));
}

async function saveOtp(e: OtpEntity): Promise<void> {
  await ensureTable(OTP_TABLE);
  await upsertEntity(OTP_TABLE, e);
}

// POST /api/auth/forgot-password/request   { phone }
async function forgotPasswordRequest(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return optionsResponse();
  try {
    const body = (await request.json()) as { phone?: string };
    const phone = normalizePhone(body.phone);
    if (!phone) return json({ error: 'Phone number is required.' }, 400);

    const customer = await findCustomerByPhone(phone);

    // Defence: don't reveal whether the phone exists. Return success either
    // way, but only send the WhatsApp + persist the OTP if it's a real user.
    if (!customer) {
      await recordPasswordResetEvent({ phone, action: 'request', reason: 'no-account', req: request });
      return json({ ok: true, validityMinutes: OTP_VALIDITY_MIN });
    }

    const now = Date.now();
    const existing = await loadOtp(phone);
    if (existing) {
      const windowStart = new Date(existing.windowStartedAt).getTime();
      const lastSent = new Date(existing.lastSentAt).getTime();
      const withinWindow = now - windowStart < OTP_VALIDITY_MS;
      if (withinWindow && existing.sentCount >= MAX_OTPS_PER_WINDOW) {
        await recordPasswordResetEvent({
          userId: customer.email,
          phone,
          action: 'request-blocked',
          reason: 'rate-limit',
          req: request,
        });
        return json({ error: 'Too many OTP requests. Please try again later.' }, 429);
      }
      if (now - lastSent < SEND_COOLDOWN_MS) {
        return json({ error: 'Please wait a moment before requesting another OTP.' }, 429);
      }
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 8);
    const expiresAt = new Date(now + OTP_VALIDITY_MS).toISOString();
    const windowStart =
      existing && now - new Date(existing.windowStartedAt).getTime() < OTP_VALIDITY_MS
        ? existing.windowStartedAt
        : new Date(now).toISOString();
    const sentCount = (existing && windowStart === existing.windowStartedAt ? existing.sentCount : 0) + 1;

    await saveOtp({
      partitionKey: 'phone',
      rowKey: phoneRowKey(phone),
      email: customer.email,
      otpHash,
      expiresAt,
      attempts: 0,
      sentCount,
      windowStartedAt: windowStart,
      lastSentAt: new Date(now).toISOString(),
      used: false,
    });

    const sendResult = await sendWhatsApp(
      phone,
      buildPasswordResetOtpMessage({
        name: customer.name || 'there',
        otp,
        validityMinutes: OTP_VALIDITY_MIN,
      }),
    );

    if (!sendResult.ok) {
      context.error('forgotPassword whatsapp send failed', sendResult.reason, sendResult.detail);
    }

    await recordPasswordResetEvent({
      userId: customer.email,
      phone,
      action: 'request',
      reason: sendResult.ok ? undefined : `whatsapp-${sendResult.reason}`,
      req: request,
    });

    // If WhatsApp delivery failed and we have no fallback (EXPOSE_OTP is the
    // operator escape hatch — not a dev-vs-prod branch, just a config flag),
    // the user has no way to complete the flow. Surface a real error rather
    // than claiming a message was sent.
    if (!sendResult.ok && !EXPOSE_OTP) {
      const detail =
        sendResult.reason === 'not-configured'
          ? 'WhatsApp delivery is not configured on this server, so we couldn\'t send the OTP. Please contact support to reset your password.'
          : 'We couldn\'t send the OTP via WhatsApp right now. Please try again in a few minutes or contact support.';
      return json({ error: detail }, 503);
    }

    // Outcome-based fields (env-agnostic):
    //   sent=true  → WhatsApp Graph API confirmed delivery
    //   sent=false → delivery did not happen; devOtp is included so the
    //                operator-enabled fallback path can still complete
    const payload: Record<string, unknown> = {
      ok: true,
      validityMinutes: OTP_VALIDITY_MIN,
      sent: sendResult.ok,
    };
    if (EXPOSE_OTP) payload.devOtp = otp;
    return json(payload);
  } catch (err) {
    context.error('forgotPasswordRequest error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// POST /api/auth/forgot-password/verify   { phone, otp }
async function forgotPasswordVerify(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return optionsResponse();
  if (!JWT_SECRET) return json({ error: 'Server misconfigured: JWT_SECRET missing' }, 500);

  try {
    const body = (await request.json()) as { phone?: string; otp?: string };
    const phone = normalizePhone(body.phone);
    const otp = (body.otp ?? '').trim();
    if (!phone || !otp) return json({ error: 'Phone and OTP are required.' }, 400);

    const stored = await loadOtp(phone);
    if (!stored || stored.used) {
      await recordPasswordResetEvent({ phone, action: 'verify-failed', reason: 'no-otp', req: request });
      return json({ error: 'Invalid or expired OTP.' }, 400);
    }
    if (new Date(stored.expiresAt).getTime() < Date.now()) {
      await recordPasswordResetEvent({
        userId: stored.email,
        phone,
        action: 'verify-failed',
        reason: 'expired',
        req: request,
      });
      return json({ error: 'Invalid or expired OTP.' }, 400);
    }
    if (stored.attempts >= MAX_OTP_ATTEMPTS) {
      await recordPasswordResetEvent({
        userId: stored.email,
        phone,
        action: 'verify-failed',
        reason: 'attempts-exhausted',
        req: request,
      });
      return json({ error: 'Too many incorrect attempts. Request a new OTP.' }, 429);
    }

    const ok = await bcrypt.compare(otp, stored.otpHash);
    if (!ok) {
      await saveOtp({ ...stored, attempts: stored.attempts + 1 });
      await recordPasswordResetEvent({
        userId: stored.email,
        phone,
        action: 'verify-failed',
        reason: 'bad-code',
        req: request,
      });
      return json({ error: 'Invalid or expired OTP.' }, 400);
    }

    const resetToken = jwt.sign(
      { sub: stored.email, phone, purpose: RESET_TOKEN_PURPOSE, jti: randomUUID() },
      JWT_SECRET,
      { expiresIn: RESET_TOKEN_TTL_SECONDS },
    );

    await recordPasswordResetEvent({ userId: stored.email, phone, action: 'verify', req: request });

    return json({ ok: true, resetToken, expiresIn: RESET_TOKEN_TTL_SECONDS });
  } catch (err) {
    context.error('forgotPasswordVerify error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// POST /api/auth/forgot-password/reset   { resetToken, newPassword }
async function forgotPasswordReset(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return optionsResponse();
  if (!JWT_SECRET) return json({ error: 'Server misconfigured: JWT_SECRET missing' }, 500);

  try {
    const body = (await request.json()) as { resetToken?: string; newPassword?: string };
    if (!body.resetToken || !body.newPassword) {
      return json({ error: 'resetToken and newPassword are required.' }, 400);
    }
    if (body.newPassword.length < 8) {
      return json({ error: 'Password must be at least 8 characters.' }, 400);
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(body.resetToken, JWT_SECRET) as jwt.JwtPayload;
    } catch {
      return json({ error: 'Reset session expired. Please start again.' }, 401);
    }
    if (payload.purpose !== RESET_TOKEN_PURPOSE || !payload.sub || !payload.phone) {
      return json({ error: 'Invalid reset token.' }, 401);
    }

    const email = String(payload.sub);
    const phone = String(payload.phone);
    const customer = await findCustomerByEmail(email);
    if (!customer) return json({ error: 'Account not found.' }, 404);

    const stored = await loadOtp(phone);
    if (!stored || stored.used) {
      return json({ error: 'Reset session already used.' }, 400);
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await setPasswordHash(customer.email, passwordHash);
    await saveOtp({ ...stored, used: true });
    await updateLastLogin(customer.email);

    await recordPasswordResetEvent({ userId: customer.email, phone, action: 'reset', req: request });
    await recordLogin({
      userId: customer.email,
      email: customer.email,
      phone: customer.mobile,
      method: 'otp-reset',
      req: request,
    });

    const updated = await findCustomerByEmail(customer.email);
    const { token, expiresIn } = issueCustomerToken(updated ?? customer);
    return json({
      ok: true,
      token,
      expiresIn,
      user: {
        email: customer.email,
        name: customer.name,
        picture: customer.picture,
        mobile: customer.mobile,
      },
    });
  } catch (err) {
    context.error('forgotPasswordReset error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

app.http('forgotPasswordRequest', {
  route: 'auth/forgot-password/request',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: forgotPasswordRequest,
});

app.http('forgotPasswordVerify', {
  route: 'auth/forgot-password/verify',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: forgotPasswordVerify,
});

app.http('forgotPasswordReset', {
  route: 'auth/forgot-password/reset',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: forgotPasswordReset,
});
