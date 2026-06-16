import { randomUUID } from 'crypto';
import { HttpRequest } from '@azure/functions';
import { ensureTable, upsertEntity } from './tableStorage';

export type LoginMethod = 'email-password' | 'google' | 'otp-reset';
export type PasswordResetAction = 'request' | 'verify' | 'reset' | 'verify-failed' | 'request-blocked';

const LOGIN_TABLE = 'loginAudit';
const PASSWORD_RESET_TABLE = 'passwordResetAudit';

function ip(req?: HttpRequest): string {
  if (!req) return '';
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    ''
  );
}

function userAgent(req?: HttpRequest): string {
  return req?.headers.get('user-agent') ?? '';
}

// Most-recent-first rowKey. Table Storage rowKey sorts lexicographically, so we
// flip the timestamp so newer rows come first when listing per partition.
function reverseTimeRowKey(): string {
  const reversed = (10_000_000_000_000 - Date.now()).toString().padStart(13, '0');
  return `${reversed}_${randomUUID()}`;
}

export async function recordLogin(params: {
  userId: string;           // canonical id (email)
  email?: string;
  phone?: string;
  method: LoginMethod;
  req?: HttpRequest;
  success?: boolean;
}): Promise<void> {
  try {
    await ensureTable(LOGIN_TABLE);
    await upsertEntity(LOGIN_TABLE, {
      partitionKey: params.userId,
      rowKey: reverseTimeRowKey(),
      userId: params.userId,
      email: params.email ?? '',
      phone: params.phone ?? '',
      method: params.method,
      success: params.success !== false,
      ip: ip(params.req),
      userAgent: userAgent(params.req),
      timestamp: new Date().toISOString(),
    });
  } catch {
    // audit logging must never break the auth path
  }
}

export async function recordPasswordResetEvent(params: {
  userId?: string;
  phone: string;
  action: PasswordResetAction;
  reason?: string;
  req?: HttpRequest;
}): Promise<void> {
  try {
    await ensureTable(PASSWORD_RESET_TABLE);
    await upsertEntity(PASSWORD_RESET_TABLE, {
      partitionKey: params.phone,
      rowKey: reverseTimeRowKey(),
      userId: params.userId ?? '',
      phone: params.phone,
      action: params.action,
      reason: params.reason ?? '',
      ip: ip(params.req),
      userAgent: userAgent(params.req),
      timestamp: new Date().toISOString(),
    });
  } catch {
    // never break the reset path on audit failure
  }
}
