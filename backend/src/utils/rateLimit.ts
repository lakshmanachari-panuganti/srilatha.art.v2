import { HttpRequest, HttpResponseInit } from '@azure/functions';
import { ensureTable, getEntity, upsertEntity } from './tableStorage';

const TABLE = 'rateLimits';

interface RateLimitEntity {
  partitionKey: string;       // scope, e.g. 'login:ip'
  rowKey: string;             // sanitized key value
  count: number;
  windowStartedAt: string;    // ISO timestamp
  lastAttemptAt: string;
}

/**
 * Pull the caller's IP from common reverse-proxy headers. Azure Functions
 * sits behind a proxy in all hosting modes, so trusting `x-forwarded-for`
 * is the standard pattern — same one `auditLog.ts` already uses.
 */
export function clientIp(req: HttpRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    ''
  );
}

// Table Storage rowKey forbids '/', '\', '#', '?' and control chars. Email
// addresses and IPs don't contain any of those, but we still defensively
// strip them so a hostile identifier can't break the persistence layer.
function safeRowKey(value: string): string {
  return value
    .replace(/[\\/#?]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '_')
    .toLowerCase()
    .slice(0, 200);
}

export interface RateLimitOptions {
  scope: string;              // e.g. 'login:ip'
  key: string;                // the value being limited (IP, email, ...)
  max: number;                // max attempts per window
  windowMs: number;           // window size
}

/**
 * Enforce a sliding-window rate limit. Returns a 429 `HttpResponseInit` if
 * the caller is over the threshold; returns `null` if the call is allowed
 * (and records the attempt). Failures (e.g. table-storage hiccup) fail
 * OPEN — we'd rather not lock out real users if storage is flaky; the
 * auth path is still protected by passwords/HMAC.
 */
export async function enforceRateLimit(
  opts: RateLimitOptions,
): Promise<HttpResponseInit | null> {
  const { scope, key, max, windowMs } = opts;
  if (!key) return null;

  try {
    await ensureTable(TABLE);
    const rowKey = safeRowKey(key);
    const existing = await getEntity<RateLimitEntity>(TABLE, scope, rowKey);
    const now = Date.now();

    let count = 1;
    let windowStartedAt = new Date(now).toISOString();

    if (existing) {
      const windowStart = new Date(existing.windowStartedAt).getTime();
      if (now - windowStart < windowMs) {
        if (existing.count >= max) {
          const retryAfterSec = Math.ceil((windowStart + windowMs - now) / 1000);
          return {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': String(Math.max(1, retryAfterSec)),
            },
            body: JSON.stringify({
              error: 'Too many attempts. Please try again later.',
            }),
          };
        }
        count = existing.count + 1;
        windowStartedAt = existing.windowStartedAt;
      }
    }

    await upsertEntity(TABLE, {
      partitionKey: scope,
      rowKey,
      count,
      windowStartedAt,
      lastAttemptAt: new Date(now).toISOString(),
    });

    return null;
  } catch {
    return null;
  }
}
