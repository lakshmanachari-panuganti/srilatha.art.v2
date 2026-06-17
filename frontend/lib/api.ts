/**
 * Minimal API client. Reads the API base URL from NEXT_PUBLIC_API_URL.
 * Defaults to the Azure Functions dev URL in local dev (localhost:7071).
 */

// Workflow exports NEXT_PUBLIC_API_BASE_URL; older convention NEXT_PUBLIC_API_URL also accepted.
const RAW_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:7071/api';
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

// ─── Reviews (public) ────────────────────────────────────────────────────────

export interface PublicReview {
  id: string;
  productId: string;
  author: string;
  city?: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verified: boolean;
}

export function listProductReviews(productId: string) {
  return request<{ reviews: PublicReview[]; total: number }>(
    `/reviews?productId=${encodeURIComponent(productId)}`,
  );
}

export function submitProductReview(
  input: { productId: string; rating: number; title: string; body: string; city?: string },
  token: string,
) {
  return request<{ id: string; status: 'pending'; message: string }>(
    '/reviews',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    },
  );
}

// ─── Public runtime config ───────────────────────────────────────────────────

export interface PublicConfig {
  googleClientId: string;
}

export function getPublicConfig() {
  return request<PublicConfig>('/config/public');
}

// ─── Customer Auth ───────────────────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  expiresIn: number;
  user: { email: string; name: string; picture?: string; mobile?: string };
}

export function authRegister(input: { name: string; email: string; password: string; mobile?: string }) {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function authLogin(input: { email?: string; phone?: string; identifier?: string; password: string }) {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function authGoogle(input: {
  accessToken?: string;
  profile?: { sub?: string; email?: string; name?: string; picture?: string };
  mobile?: string;
}) {
  return request<AuthResponse & { created: boolean; merged: boolean }>('/auth/google', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function forgotPasswordRequest(input: { phone: string }) {
  return request<{
    ok: true;
    validityMinutes: number;
    sent: boolean;       // true iff WhatsApp Graph confirmed delivery
    devOtp?: string;     // only present when operator opted in to expose the code
  }>('/auth/forgot-password/request', { method: 'POST', body: JSON.stringify(input) });
}

export function forgotPasswordVerify(input: { phone: string; otp: string }) {
  return request<{ ok: true; resetToken: string; expiresIn: number }>(
    '/auth/forgot-password/verify',
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function forgotPasswordReset(input: { resetToken: string; newPassword: string }) {
  return request<AuthResponse & { ok: true }>('/auth/forgot-password/reset', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ─── Custom orders ───────────────────────────────────────────────────────────

export interface SubmitCustomOrderInput {
  name: string;
  phone: string;
  email: string;
  description: string;
  budget?: string;
  category?: string;
  referenceImageUrl?: string;
}

export interface SubmitCustomOrderResponse {
  success: true;
  id: string;
  message: string;
  emailSent: boolean;
  emailTo: string;
  emailError?: string;
  emailErrorReason?: 'not-configured' | 'smtp-error';
}

export function submitCustomOrder(input: SubmitCustomOrderInput) {
  return request<SubmitCustomOrderResponse>('/custom-orders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
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

export interface VerifyPaymentResponse {
  success: boolean;
  orderId: string;
  emailSent: boolean;
  emailTo: string | null;
  emailError?: string;
  emailErrorReason?: 'not-configured' | 'smtp-error';
}

export function verifyPayment(orderId: string, input: VerifyPaymentInput) {
  return request<VerifyPaymentResponse>(
    `/orders/${encodeURIComponent(orderId)}/verify-payment`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

// ─── Products ────────────────────────────────────────────────────────────────

import type { Product } from './data';

export interface ListProductsParams {
  category?: string;
  bestSeller?: boolean;
  newArrival?: boolean;
  onSale?: boolean;
  inStock?: boolean;
  limit?: number;
}

export interface ListProductsResponse {
  products: Product[];
  total: number;
  page: number;
}

export function listProducts(params: ListProductsParams = {}) {
  const search = new URLSearchParams();
  if (params.category && params.category !== 'all') search.set('category', params.category);
  if (params.bestSeller) search.set('bestSeller', 'true');
  if (params.newArrival) search.set('newArrival', 'true');
  if (params.onSale) search.set('onSale', 'true');
  if (params.inStock !== undefined) search.set('inStock', String(params.inStock));
  if (params.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return request<ListProductsResponse>(`/products${qs ? `?${qs}` : ''}`);
}

export function getProductBySlug(slug: string) {
  return request<Product>(`/products/${encodeURIComponent(slug)}`);
}

// ─── Announcements (public) ──────────────────────────────────────────────────

export interface PublicAnnouncement {
  id: string;
  message: string;
  cta?: string;
  link?: string;
  startDate?: string;
  endDate?: string;
  priority: number;
}

export function listAnnouncements() {
  return request<{ announcements: PublicAnnouncement[] }>('/announcements');
}
