import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  CustomerEntity,
  findCustomerByEmailOrPhone,
  upsertCustomer,
  updateLastLogin,
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
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

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
    },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL_SECONDS },
  );
  return { token, expiresIn: TOKEN_TTL_SECONDS };
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

app.http('customerRegister', {
  route: 'auth/register',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: customerRegister,
});

app.http('customerLogin', {
  route: 'auth/login',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: customerLogin,
});
