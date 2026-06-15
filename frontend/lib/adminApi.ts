/**
 * Admin API client. Auto-attaches the admin JWT from localStorage
 * (key: srilatha_admin_token) to every request.
 */

const RAW_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:7071/api';
const API_BASE = RAW_BASE.replace(/\/+$/, '');

const TOKEN_KEY = 'srilatha_admin_token';

export class AdminApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearAdminToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => undefined) : await res.text();

  if (!res.ok) {
    const msg = (body && typeof body === 'object' && 'error' in body)
      ? String((body as { error: string }).error)
      : `Request failed (${res.status})`;
    throw new AdminApiError(msg, res.status, body);
  }
  return body as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────

export interface AdminLoginResponse {
  token: string;
  expiresIn: number;
  admin: { email: string; name: string; role: 'admin' | 'super_admin' };
}

export const adminApi = {
  // Auth
  login: (email: string, password: string) =>
    request<AdminLoginResponse>('/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  setup: (input: { email: string; password: string; name: string; setupToken: string }) =>
    request<{ success: true; email: string }>('/admin/setup', { method: 'POST', body: JSON.stringify(input) }),

  // Stats
  stats: () => request<{
    revenue: { today: number; last7Days: number; last30Days: number; allTime: number };
    orders: { total: number; byStatus: Record<string, number> };
    products: { total: number; active: number; lowStockCount: number; lowStock: Array<{ id: string; category: string; stockCount: number }> };
    customOrders: { total: number; byStatus: Record<string, number> };
    reviews: { total: number; pending: number };
  }>('/admin/stats'),

  // Products
  listProducts: () => request<{ products: AdminProduct[]; total: number }>('/admin/products'),
  createProduct: (data: Partial<AdminProduct>) =>
    request<AdminProduct>('/admin/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: string, data: Partial<AdminProduct>) =>
    request<AdminProduct>(`/admin/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProduct: (id: string, hard = false) =>
    request<{ success: true }>(`/admin/products/${encodeURIComponent(id)}${hard ? '?hard=true' : ''}`, { method: 'DELETE' }),

  // Orders
  listOrders: (params?: { status?: string; search?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return request<{ orders: AdminOrder[]; total: number; page: number }>(`/admin/orders${q ? `?${q}` : ''}`);
  },
  getOrder: (id: string) => request<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(id)}`),
  updateOrderStatus: (id: string, body: { status: string; note?: string; trackingNumber?: string; trackingUrl?: string }) =>
    request<{ success: true; status: string }>(`/admin/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify(body) }),
  addOrderNote: (id: string, note: string) =>
    request<{ success: true }>(`/admin/orders/${encodeURIComponent(id)}/notes`, { method: 'POST', body: JSON.stringify({ note }) }),
  bulkOrderStatus: (orderIds: string[], status: string) =>
    request<{ results: Array<{ id: string; ok: boolean; error?: string }> }>(`/admin/orders/bulk-status`, { method: 'POST', body: JSON.stringify({ orderIds, status }) }),

  // Custom orders
  listCustomOrders: (status?: string) =>
    request<{ customOrders: AdminCustomOrder[]; total: number }>(`/admin/custom-orders${status ? `?status=${status}` : ''}`),
  updateCustomOrder: (id: string, body: { status?: string; adminNote?: string }) =>
    request<AdminCustomOrder>(`/admin/custom-orders/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // Coupons
  listCoupons: () => request<{ coupons: AdminCoupon[] }>('/admin/coupons'),
  createCoupon: (data: Partial<AdminCoupon>) =>
    request<AdminCoupon>('/admin/coupons', { method: 'POST', body: JSON.stringify(data) }),
  updateCoupon: (code: string, data: Partial<AdminCoupon>) =>
    request<AdminCoupon>(`/admin/coupons/${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCoupon: (code: string) =>
    request<{ success: true }>(`/admin/coupons/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  couponRedemptions: (code: string) =>
    request<{ code: string; total: number; redemptions: unknown[] }>(`/admin/coupons/${encodeURIComponent(code)}/redemptions`),

  // Announcements
  listAnnouncements: () => request<{ announcements: AdminAnnouncement[] }>('/admin/announcements'),
  createAnnouncement: (data: Partial<AdminAnnouncement>) =>
    request<AdminAnnouncement>('/admin/announcements', { method: 'POST', body: JSON.stringify(data) }),
  updateAnnouncement: (id: string, data: Partial<AdminAnnouncement>) =>
    request<AdminAnnouncement>(`/admin/announcements/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAnnouncement: (id: string) =>
    request<{ success: true }>(`/admin/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Reviews
  listReviews: (status?: string) =>
    request<{ reviews: AdminReview[]; total: number }>(`/admin/reviews${status ? `?status=${status}` : ''}`),
  moderateReview: (id: string, action: 'approve' | 'reject') =>
    request<AdminReview>(`/admin/reviews/${encodeURIComponent(id)}/${action}`, { method: 'PATCH' }),

  // WhatsApp
  listConversations: () =>
    request<{ conversations: AdminWhatsappSummary[]; total: number }>('/admin/whatsapp/conversations'),
  getConversation: (phone: string) =>
    request<{ phone: string; messages: AdminWhatsappMessage[] }>(`/admin/whatsapp/conversations/${encodeURIComponent(phone)}`),
};

// ─── Types ────────────────────────────────────────────────────────────────

export interface AdminProduct {
  id: string;
  category: string;
  slug: string;
  name: string;
  shortDesc: string;
  description: string;
  price: number;
  originalPrice?: number;
  images: string[];
  material: string;
  careInstructions: string;
  dimensions: string;
  rating?: number;
  reviewCount?: number;
  inStock: boolean;
  stockCount: number;
  isBestSeller: boolean;
  isNewArrival: boolean;
  isSale: boolean;
  tags: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrder {
  orderId: string;
  status: string;
  customer: { name: string; email: string; phone: string } | null;
  address: { line1: string; city: string; state: string; pincode: string } | null;
  razorpayOrderId: string;
  subtotal: number;
  shipping: number;
  discount?: number;
  total: number;
  createdAt: string;
  trackingNumber?: string;
  trackingUrl?: string;
  couponCode?: string;
}

export interface AdminOrderDetail extends AdminOrder {
  items: Array<{ productId: string; name: string; qty: number; price: number }>;
  events: Array<{ eventType: string; note?: string; from?: string; to?: string; timestamp: string; changedBy?: string }>;
}

export interface AdminCustomOrder {
  id: string;
  status: string;
  name: string;
  email: string;
  phone: string;
  artType: string;
  budget: string;
  description: string;
  dimensions?: string;
  colorPreferences?: string;
  occasion?: string;
  referenceUrl?: string;
  adminNote?: string;
  createdAt: string;
}

export interface AdminCoupon {
  code: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';
  value: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  startDate?: string;
  endDate?: string;
  usageLimit?: number;
  currentUsage: number;
  active: boolean;
  description?: string;
  promoteInBanner: boolean;
  createdAt: string;
}

export interface AdminAnnouncement {
  id: string;
  message: string;
  link?: string;
  startDate?: string;
  endDate?: string;
  active: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminReview {
  id: string;
  status: string;
  productId: string;
  author: string;
  city?: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verified: boolean;
}

export interface AdminWhatsappSummary {
  phone: string;
  lastMessage: string;
  lastDirection: 'inbound' | 'outbound';
  lastTimestamp: string;
}

export interface AdminWhatsappMessage {
  partitionKey: string;
  rowKey: string;
  direction: 'inbound' | 'outbound';
  body?: string;
  templateName?: string;
  status?: string;
  timestamp: string;
}
