import { HttpRequest, HttpResponseInit } from '@azure/functions';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? '';

export interface AdminClaims {
  sub: string;        // admin id (email)
  name: string;
  // Three role spellings are accepted: `admin`, `super_admin`, `superadmin`.
  // The seed script (infra/seed-admin.ps1) writes `superadmin`; the setup
  // endpoint writes `super_admin`. Both grant the same access.
  role: 'admin' | 'super_admin' | 'superadmin';
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
 * Reads the `Authorization: Bearer <jwt>` header, verifies the signature and
 * returns the admin claims. Returns null if the token is missing or invalid.
 */
export function readAdminClaims(request: HttpRequest): AdminClaims | null {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  if (!JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AdminClaims;
    if (!ADMIN_ROLES.has(decoded.role)) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Convenience: returns either the claims or a 401 response.
 * Usage:
 *   const claimsOrResp = requireAdmin(request);
 *   if ('status' in claimsOrResp) return claimsOrResp;
 *   const admin = claimsOrResp;
 */
export function requireAdmin(request: HttpRequest): AdminClaims | HttpResponseInit {
  const claims = readAdminClaims(request);
  return claims ?? unauthorized();
}
