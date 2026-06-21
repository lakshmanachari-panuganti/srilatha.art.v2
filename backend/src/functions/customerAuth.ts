import { wrapCors } from '../utils/cors';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import {
  CustomerEntity,
  findCustomerByEmail,
  findCustomerByEmailOrPhone,
  upsertCustomer,
  updateLastLogin,
  bumpCustomerTokenVersion,
} from '../utils/customerStore';
import { isValidEmail, normalizeEmail, normalizePhone } from '../utils/identifiers';
import { recordLogin } from '../utils/auditLog';
import { clientIp, enforceRateLimit } from '../utils/rateLimit';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const JWT_SECRET = process.env.JWT_SECRET ?? '';
// Customer sessions are 24 hours. The frontend silently renews via
// /api/auth/refresh during active use, so well-behaved users don't notice.
// A stolen token is therefore valid for at most 24h instead of 30 days.
const TOKEN_TTL_SECONDS = 60 * 60 * 24;
// /api/auth/refresh accepts tokens up to this much past expiry, so a user
// who left the tab open over a long weekend can keep their session.
const REFRESH_GRACE_SECONDS = 60 * 60 * 24 * 7; // 7 days

// A valid-but-unmatchable bcrypt hash. Used to keep response time constant
// when an account doesn't exist, so login timing can't enumerate which
// emails/phones are registered.
const DUMMY_BCRYPT_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.4j9q1eY/JlZkPJrW8/2yJqL8nKpW';

function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
function options(): HttpResponseInit {
  return { status: 204, headers: CORS_HEADERS };
}

export function issueCustomerToken(c: CustomerEntity): { token: string; expiresIn: number } {
  const token = jwt.sign(
    {
      sub: c.email,
      email: c.email,
      name: c.name,
      picture: c.picture,
      mobile: c.mobile,
      // Revocation lever: bumped in customerStore on logout / password
      // change. The verify path rejects tokens whose `ver` is behind the
      // server's record. Default 0 keeps pre-VUL-009 tokens valid.
      ver: c.tokenVersion ?? 0,
      // Unique token id — useful for audit logs and future jti revocation.
      jti: randomUUID(),
    },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL_SECONDS },
  );
  return { token, expiresIn: TOKEN_TTL_SECONDS };
}

export interface CustomerTokenClaims {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  mobile?: string;
  ver?: number;
  jti?: string;
}

/**
 * Verify a customer JWT and confirm its `ver` claim still matches the
 * server-side `tokenVersion` for that customer. Returns null on any failure
 * so callers can return a generic 401.
 *
 * `ignoreExpiration` is used by /api/auth/refresh, which accepts a recently
 * expired token (within REFRESH_GRACE_SECONDS) to mint a fresh one. All
 * other call paths must verify with default expiry.
 */
export async function verifyCustomerToken(
  token: string,
  opts: { ignoreExpiration?: boolean } = {},
): Promise<{ claims: CustomerTokenClaims; customer: CustomerEntity } | null> {
  if (!JWT_SECRET) return null;
  let claims: CustomerTokenClaims;
  try {
    claims = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      ignoreExpiration: opts.ignoreExpiration === true,
    }) as CustomerTokenClaims;
  } catch {
    return null;
  }
  if (!claims?.email) return null;

  const customer = await findCustomerByEmail(claims.email);
  if (!customer) return null;

  const serverVersion = customer.tokenVersion ?? 0;
  const tokenVersion = claims.ver ?? 0;
  if (tokenVersion < serverVersion) return null;

  return { claims, customer };
}

function publicUser(c: CustomerEntity) {
  return { email: c.email, name: c.name, picture: c.picture, mobile: c.mobile };
}

// POST /api/auth/register
async function customerRegister(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  if (!JWT_SECRET) return json({ error: 'Server misconfigured: JWT_SECRET missing' }, 500);

  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
      mobile?: string;
    };

    if (!body.email || !body.password || !body.name) {
      return json({ error: 'Name, email and password are required.' }, 400);
    }
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
      return json({ error: 'Please enter a valid email address.' }, 400);
    }
    if (body.password.length < 8) {
      return json({ error: 'Password must be at least 8 characters.' }, 400);
    }

    // Anti-spam: cap registrations per IP. Generous threshold (legit users
    // register at most a handful of times); blocks scripted account flooding.
    const ipBlocked = await enforceRateLimit({
      scope: 'register:ip',
      key: clientIp(request),
      max: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (ipBlocked) {
      return { ...ipBlocked, headers: { ...CORS_HEADERS, ...(ipBlocked.headers ?? {}) } };
    }

    const phone = body.mobile ? normalizePhone(body.mobile) : undefined;

    // Refuse to create a new account if an email-password one already exists —
    // matched either by email or by phone — to prevent silent overwrites.
    const existingByEmail = await findCustomerByEmailOrPhone(email);
    if (existingByEmail?.passwordHash) {
      return json({ error: 'An account with this email already exists. Try signing in.' }, 409);
    }
    if (phone) {
      const existingByPhone = await findCustomerByEmailOrPhone(phone);
      if (existingByPhone?.passwordHash && existingByPhone.email !== email) {
        return json(
          { error: 'An account with this phone number already exists. Try signing in.' },
          409,
        );
      }
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const { customer } = await upsertCustomer({
      email,
      name: body.name.trim(),
      mobile: phone,
      passwordHash,
      provider: 'email',
    });

    await recordLogin({
      userId: customer.email,
      email: customer.email,
      phone: customer.mobile,
      method: 'email-password',
      req: request,
    });

    const { token, expiresIn } = issueCustomerToken(customer);
    return json({ token, expiresIn, user: publicUser(customer) });
  } catch (err) {
    context.error('customerRegister error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// POST /api/auth/login   accepts { email | phone | identifier, password }
async function customerLogin(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  if (!JWT_SECRET) return json({ error: 'Server misconfigured: JWT_SECRET missing' }, 500);

  try {
    const body = (await request.json()) as {
      email?: string;
      phone?: string;
      identifier?: string;
      password?: string;
    };
    const identifier = (body.identifier ?? body.email ?? body.phone ?? '').trim();
    if (!identifier || !body.password) {
      return json({ error: 'Email/phone and password are required.' }, 400);
    }

    // Rate-limit by IP and by identifier. Generous thresholds so a normal
    // user never hits them; tight enough to stall password brute-forcing.
    const ip = clientIp(request);
    const ipBlocked = await enforceRateLimit({
      scope: 'customer-login:ip',
      key: ip,
      max: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (ipBlocked) {
      return { ...ipBlocked, headers: { ...CORS_HEADERS, ...(ipBlocked.headers ?? {}) } };
    }
    const idBlocked = await enforceRateLimit({
      scope: 'customer-login:identifier',
      key: identifier.toLowerCase(),
      max: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (idBlocked) {
      return { ...idBlocked, headers: { ...CORS_HEADERS, ...(idBlocked.headers ?? {}) } };
    }

    const customer = await findCustomerByEmailOrPhone(identifier);
    if (!customer?.passwordHash) {
      // Run a dummy compare so timing matches the real-account path and
      // unknown identifiers can't be enumerated by response latency.
      await bcrypt.compare(body.password, DUMMY_BCRYPT_HASH);
      return json({ error: 'Invalid credentials.' }, 401);
    }
    const ok = await bcrypt.compare(body.password, customer.passwordHash);
    if (!ok) {
      return json({ error: 'Invalid credentials.' }, 401);
    }

    await updateLastLogin(customer.email);
    await recordLogin({
      userId: customer.email,
      email: customer.email,
      phone: customer.mobile,
      method: 'email-password',
      req: request,
    });

    const { token, expiresIn } = issueCustomerToken(customer);
    return json({ token, expiresIn, user: publicUser(customer) });
  } catch (err) {
    context.error('customerLogin error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// POST /api/auth/logout — bump tokenVersion to invalidate every outstanding
// JWT for this customer. Idempotent. Returns 204 even if the token is
// expired/invalid (sign-out shouldn't fail because the token already aged
// out — the client is already throwing it away).
async function customerLogout(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { status: 204, headers: CORS_HEADERS };

  // ignoreExpiration so logout-after-expiry still bumps the version.
  const verified = await verifyCustomerToken(token, { ignoreExpiration: true });
  if (verified?.customer?.email) {
    await bumpCustomerTokenVersion(verified.customer.email);
  }
  return { status: 204, headers: CORS_HEADERS };
}

// POST /api/auth/refresh — mint a fresh token if the presented one is valid
// or recently expired (within REFRESH_GRACE_SECONDS) and not revoked.
async function customerRefresh(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  if (!JWT_SECRET) return json({ error: 'Server misconfigured: JWT_SECRET missing' }, 500);

  const auth = request.headers.get('Authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!presented) return json({ error: 'Authorization required.' }, 401);

  const verified = await verifyCustomerToken(presented, { ignoreExpiration: true });
  if (!verified) return json({ error: 'Session expired. Please sign in again.' }, 401);

  // Refuse if outside the grace window so a long-stolen token can't be
  // refreshed forever.
  const claims = verified.claims as CustomerTokenClaims & { exp?: number; iat?: number };
  const nowSec = Math.floor(Date.now() / 1000);
  if (claims.exp && nowSec - claims.exp > REFRESH_GRACE_SECONDS) {
    return json({ error: 'Session expired. Please sign in again.' }, 401);
  }

  const { token, expiresIn } = issueCustomerToken(verified.customer);
  return json({ token, expiresIn, user: publicUser(verified.customer) });
}

app.http('customerRegister', {
  route: 'auth/register',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(customerRegister),
});

app.http('customerLogin', {
  route: 'auth/login',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(customerLogin),
});

app.http('customerLogout', {
  route: 'auth/logout',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(customerLogout),
});

app.http('customerRefresh', {
  route: 'auth/refresh',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(customerRefresh),
});
