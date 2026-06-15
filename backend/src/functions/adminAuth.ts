import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getEntity, queryEntitiesAll, upsertEntity } from '../utils/tableStorage';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const JWT_SECRET = process.env.JWT_SECRET ?? '';
const TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 hours

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

interface AdminEntity {
  partitionKey: string;       // 'admin'
  rowKey: string;             // lowercase email
  email: string;
  passwordHash: string;
  name: string;
  role: 'admin' | 'super_admin';
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
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

    const admin = await getEntity<AdminEntity>('admins', 'admin', email);
    if (!admin || admin.active === false) {
      return json({ error: 'Invalid email or password' }, 401);
    }

    const ok = await bcrypt.compare(body.password, admin.passwordHash);
    if (!ok) {
      return json({ error: 'Invalid email or password' }, 401);
    }

    const token = jwt.sign(
      { sub: email, name: admin.name, role: admin.role },
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
  return json({ success: true });
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

app.http('adminSetup', {
  route: 'mgmt/setup',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: adminSetup,
});

app.http('adminLogin', {
  route: 'mgmt/login',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: adminLogin,
});

app.http('adminLogout', {
  route: 'mgmt/logout',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: adminLogout,
});
