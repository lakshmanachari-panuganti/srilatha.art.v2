import * as crypto from 'node:crypto';

// Validates Meta's `x-hub-signature-256` header against the raw request body.
// Header format: `sha256=<hex digest>`. HMAC key is WHATSAPP_APP_SECRET.
export function verifySignature(rawBody: string, headerValue: string | null | undefined, secret: string): boolean {
  if (!headerValue || !secret) return false;
  const prefix = 'sha256=';
  if (!headerValue.startsWith(prefix)) return false;
  const provided = headerValue.slice(prefix.length);
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf-8').digest('hex');
  const a = Buffer.from(provided, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length === 0 || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
