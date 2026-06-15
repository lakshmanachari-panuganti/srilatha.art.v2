/**
 * Minimal API client. Reads the API base URL from NEXT_PUBLIC_API_URL.
 * Defaults to the Azure Functions dev URL in local dev (localhost:7071).
 */

const RAW_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:7071/api';
// Normalise: strip trailing slash.
const API_BASE = RAW_BASE.replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => undefined) : await res.text();

  if (!res.ok) {
    const msg = (body && typeof body === 'object' && 'error' in body) ? String((body as { error: string }).error) : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, body);
  }

  return body as T;
}

// ─── Coupons ─────────────────────────────────────────────────────────────────

export interface ValidateCouponResponse {
  valid: boolean;
  code?: string;
  type?: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';
  discount?: number;
  freeShipping?: boolean;
  description?: string;
  reason?: string;
  message?: string;
}

export function validateCoupon(input: { code: string; subtotal: number; shipping: number }) {
  return request<ValidateCouponResponse>('/coupons/validate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface CreateOrderItem {
  productId: string;
  name: string;
  qty: number;
  price: number; // paise
}

export interface CreateOrderInput {
  items: CreateOrderItem[];
  customer: { name: string; email: string; phone: string };
  address: { line1: string; city: string; state: string; pincode: string };
  couponCode?: string;
}

export interface CreateOrderResponse {
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  subtotal: number;
  shipping: number;
  discount: number;
  appliedCouponCode: string | null;
  currency: 'INR';
  key: string;
}

export function createOrder(input: CreateOrderInput) {
  return request<CreateOrderResponse>('/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface VerifyPaymentInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export function verifyPayment(orderId: string, input: VerifyPaymentInput) {
  return request<{ success: boolean; orderId: string }>(
    `/orders/${encodeURIComponent(orderId)}/verify-payment`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}
