// Helpers for normalising email + phone so they map to a single canonical key.

export function normalizeEmail(input: string | undefined | null): string {
  if (!input) return '';
  return input.trim().toLowerCase();
}

export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Returns digits-only E.164-ish form. India default: 10-digit numbers get +91 prefix.
// Used both as Table Storage rowKey and as the WhatsApp recipient.
export function normalizePhone(input: string | undefined | null): string {
  if (!input) return '';
  const digits = input.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (input.trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+${digits}`;
}

export function isLikelyPhone(input: string): boolean {
  const digits = input.replace(/[^0-9]/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

// Table Storage rowKeys cannot contain `+ / \ # ?`. We strip `+` for the rowKey
// but keep the canonical form for display + WhatsApp.
export function phoneRowKey(phoneE164: string): string {
  return phoneE164.replace(/[^0-9]/g, '');
}
