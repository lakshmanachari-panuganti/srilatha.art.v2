import { wrapCors } from '../utils/cors';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { getEntity, queryEntitiesAll, upsertEntity } from '../utils/tableStorage';
import { clientIp, enforceRateLimit } from '../utils/rateLimit';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const JWT_SECRET = process.env.JWT_SECRET ?? '';
const TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 hours

// A valid-but-unmatchable bcrypt hash. Used to keep response time constant
// when an account doesn't exist, so login timing can't enumerate which
// emails are registered.
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

export interface AdminEntity {
  partitionKey: string;       // 'admin'
  rowKey: string;             // lowercase email
  email: string;
  passwordHash: string;
  name: string;
  role: 'admin' | 'super_admin' | 'superadmin';
  // Two field names exist in the wild:
  //   - `active`    (this function's setup endpoint)
  //   - `isActive`  (infra/seed-admin.ps1 — operator-bootstrapped admins)
  active?: boolean;
  isActive?: boolean;
  createdAt: string;
  lastLoginAt?: string;
  // Revocation lever. Bumped by adminLogout to invalidate any outstanding
  // tokens for this admin. The verify path checks `claims.ver` against this.
  tokenVersion?: number;
}

export async function loadAdmin(email: string): Promise<AdminEntity | null> {
  return getEntity<AdminEntity>('admins', 'admin', email);
}

export async function bumpAdminTokenVersion(email: string): Promise<number | null> {
  const admin = await getEntity<AdminEntity>('admins', 'admin', email);
  if (!admin) return null;
  const nextVersion = (admin.tokenVersion ?? 0) + 1;
  await upsertEntity('admins', { ...admin, tokenVersion: nextVersion });
  return nextVersion;
}

// ---------------------------------------------------------------------------
// POST /api/admin/setup — first admin, only when none exist
// ---------------------------------------------------------------------------

async function adminSetup(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  if (!JWT_SECRET) return json({ error: 'Server misconfigured: JWT_SECRET missing' }, 500);

  try {
    const existing = await queryEntitiesAll<AdminEntity>('admins');
    if (existing.length > 0) {
      return json({ error: 'Setup already completed. Use the existing login.' }, 409);
    }

    const body = (await request.json()) as { email?: string; password?: string; name?: string; setupToken?: string };
    const setupToken = process.env.ADMIN_SETUP_TOKEN ?? '';
    if (!setupToken) {
      return json({ error: 'ADMIN_SETUP_TOKEN not set on server. Configure the env var to bootstrap.' }, 500);
    }
    if (!body.setupToken || body.setupToken !== setupToken) {
      return json({ error: 'Invalid setup token.' }, 403);
    }
    if (!body.email || !body.password || !body.name) {
      return json({ error: 'email, password and name are required.' }, 400);
    }
    if (body.password.length < 10) {
      return json({ error: 'Password must be at least 10 characters.' }, 400);
    }

    const email = body.email.toLowerCase().trim();
    const passwordHash = await bcrypt.hash(body.password, 10);

    const admin: AdminEntity = {
      partitionKey: 'admin',
      rowKey: email,
      email,
      passwordHash,
      name: body.name.trim(),
      role: 'super_admin',
      active: true,
      createdAt: new Date().toISOString(),
    };
    await upsertEntity('admins', admin);

    return json({ success: true, email });
  } catch (err) {
    context.error('adminSetup error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/login
// ---------------------------------------------------------------------------

async function adminLogin(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  if (!JWT_SECRET) return json({ error: 'Server misconfigured: JWT_SECRET missing' }, 500);

  try {
    const body = (await request.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return json({ error: 'email and password are required' }, 400);
    }
    const email = body.email.toLowerCase().trim();

    // Rate-limit by IP (broad anti-brute-force) and by email (anti-targeted).
    // Generous thresholds so a normal user never hits them.
    const ip = clientIp(request);
    const ipBlocked = await enforceRateLimit({
      scope: 'admin-login:ip',
      key: ip,
      max: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (ipBlocked) {
      return { ...ipBlocked, headers: { ...CORS_HEADERS, ...(ipBlocked.headers ?? {}) } };
    }
    const emailBlocked = await enforceRateLimit({
      scope: 'admin-login:email',
      key: email,
      max: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (emailBlocked) {
      return { ...emailBlocked, headers: { ...CORS_HEADERS, ...(emailBlocked.headers ?? {}) } };
    }

    const admin = await getEntity<AdminEntity>('admins', 'admin', email);
    if (!admin) {
      // Run a dummy compare so timing matches the real-account path and
      // unknown emails can't be enumerated by response latency.
      await bcrypt.compare(body.password, DUMMY_BCRYPT_HASH);
      return json({ error: 'Invalid email or password' }, 401);
    }
    // Accept either `active` or `isActive` (operator-bootstrapped rows use isActive).
    const isActive = admin.active !== false && admin.isActive !== false;
    if (!isActive) {
      return json({ error: 'Account disabled' }, 401);
    }

    const ok = await bcrypt.compare(body.password, admin.passwordHash);
    if (!ok) {
      return json({ error: 'Invalid email or password' }, 401);
    }

    const token = jwt.sign(
      {
        sub: email,
        name: admin.name,
        role: admin.role,
        // Revocation lever, in sync with the customer-side pattern. Bumped
        // by adminLogout and password resets; the verify path rejects
        // tokens whose `ver` is behind.
        ver: admin.tokenVersion ?? 0,
        jti: randomUUID(),
      },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL_SECONDS },
    );

    // Update lastLoginAt (fire-and-forget; ignore errors)
    upsertEntity('admins', { ...admin, lastLoginAt: new Date().toISOString() }).catch(() => undefined);

    return json({
      token,
      expiresIn: TOKEN_TTL_SECONDS,
      admin: { email, name: admin.name, role: admin.role },
    });
  } catch (err) {
    context.error('adminLogin error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/logout — stateless JWT, client just deletes the token.
// Endpoint kept for parity and future revocation list.
// ---------------------------------------------------------------------------

async function adminLogout(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || !JWT_SECRET) return json({ success: true });

  // ignoreExpiration so logging out after the session aged out still
  // bumps the version (defence in depth — the old token can't be
  // refreshed anyway, but operators expect logout to be authoritative).
  try {
    const claims = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      ignoreExpiration: true,
    }) as { sub?: string };
    if (claims?.sub) {
      await bumpAdminTokenVersion(claims.sub);
    }
  } catch {
    // unrecognised / forged token — ignore, still return 200
  }
  return json({ success: true });
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

app.http('adminSetup', {
  route: 'mgmt/setup',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(adminSetup),
});

app.http('adminLogin', {
  route: 'mgmt/login',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(adminLogin),
});

app.http('adminLogout', {
  route: 'mgmt/logout',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: wrapCors(adminLogout),
});
