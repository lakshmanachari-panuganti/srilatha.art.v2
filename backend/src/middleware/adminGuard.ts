import { HttpRequest, HttpResponseInit } from '@azure/functions';
import jwt from 'jsonwebtoken';
import { loadAdmin } from '../functions/adminAuth';

const JWT_SECRET = process.env.JWT_SECRET ?? '';

export interface AdminClaims {
  sub: string;        // admin id (email)
  name: string;
  // Three role spellings are accepted: `admin`, `super_admin`, `superadmin`.
  // The seed script (infra/seed-admin.ps1) writes `superadmin`; the setup
  // endpoint writes `super_admin`. Both grant the same access.
  role: 'admin' | 'super_admin' | 'superadmin';
  ver?: number;       // token version — see AdminEntity.tokenVersion
  jti?: string;
  iat: number;
  exp: number;
}

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'superadmin']);

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export function unauthorized(message = 'Unauthorized'): HttpResponseInit {
  return {
    status: 401,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message }),
  };
}

/**
 * Reads the `Authorization: Bearer <jwt>` header, verifies the signature, and
 * confirms the token's `ver` claim still matches the server-side tokenVersion
 * for that admin (i.e. the token hasn't been revoked via logout). Returns
 * null if the token is missing, invalid, or revoked.
 */
export async function readAdminClaims(request: HttpRequest): Promise<AdminClaims | null> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  if (!JWT_SECRET) return null;
  let decoded: AdminClaims;
  try {
    decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as AdminClaims;
  } catch {
    return null;
  }
  if (!ADMIN_ROLES.has(decoded.role)) return null;

  // Revocation check: token version must be at least the server's record.
  // Missing `ver` is treated as 0 so pre-VUL-009 tokens stay valid until
  // they age out naturally.
  const admin = await loadAdmin(decoded.sub);
  if (!admin) return null;
  const serverVersion = admin.tokenVersion ?? 0;
  const tokenVersion = decoded.ver ?? 0;
  if (tokenVersion < serverVersion) return null;

  return decoded;
}

/**
 * Convenience: returns either the claims or a 401 response.
 * Usage:
 *   const claimsOrResp = await requireAdmin(request);
 *   if ('status' in claimsOrResp) return claimsOrResp;
 *   const admin = claimsOrResp;
 */
export async function requireAdmin(
  request: HttpRequest,
): Promise<AdminClaims | HttpResponseInit> {
  const claims = await readAdminClaims(request);
  return claims ?? unauthorized();
}
