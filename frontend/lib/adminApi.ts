/**
 * Admin API client. Auto-attaches the admin JWT from localStorage
 * (key: srilatha_admin_token) to every request.
 */

const RAW_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:7071/api';
const API_BASE = RAW_BASE.replace(/\/+$/, '');

const TOKEN_KEY = 'srilatha_admin_token';

export class AdminApiError extends Error {
  status: number;
  body: unknown;
  /** Stable machine-readable code (e.g. AiErrorCode). Available when the API sets one. */
  code?: string;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
    if (body && typeof body === 'object' && 'code' in body && typeof (body as { code: unknown }).code === 'string') {
      this.code = (body as { code: string }).code;
    }
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
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    // Network / CORS / DNS failure — fetch never produced a Response.
    const detail = err instanceof Error ? err.message : String(err);
    throw new AdminApiError(`Cannot reach API at ${API_BASE} — ${detail}`, 0, err);
  }

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
  admin: { email: string; name: string; role: 'admin' | 'super_admin' | 'superadmin' };
}

export const adminApi = {
  // Auth
  login: (email: string, password: string) =>
    request<AdminLoginResponse>('/mgmt/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  setup: (input: { email: string; password: string; name: string; setupToken: string }) =>
    request<{ success: true; email: string }>('/mgmt/setup', { method: 'POST', body: JSON.stringify(input) }),

  // Stats
  stats: () => request<{
    revenue: { today: number; last7Days: number; last30Days: number; allTime: number };
    orders: { total: number; byStatus: Record<string, number> };
    products: { total: number; active: number; lowStockCount: number; lowStock: Array<{ id: string; category: string; stockCount: number }> };
    customOrders: { total: number; byStatus: Record<string, number> };
    reviews: { total: number; pending: number };
    whatsapp: {
      total: number;
      unread: number;
      lastWebhookReceivedAt: string | null;
      lastSendOkAt: string | null;
      lastError: string | null;
      lastErrorDetail: string | null;
      lastErrorAt: string | null;
    };
  }>('/mgmt/stats'),

  // Products
  listProducts: () => request<{ products: AdminProduct[]; total: number }>('/mgmt/products'),
  createProduct: (data: Partial<AdminProduct>) =>
    request<AdminProduct>('/mgmt/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: string, data: Partial<AdminProduct>) =>
    request<AdminProduct>(`/mgmt/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProduct: (id: string, hard = false) =>
    request<{ success: true }>(`/mgmt/products/${encodeURIComponent(id)}${hard ? '?hard=true' : ''}`, { method: 'DELETE' }),

  // Orders
  listOrders: (params?: { status?: string; search?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return request<{ orders: AdminOrder[]; total: number; page: number }>(`/mgmt/orders${q ? `?${q}` : ''}`);
  },
  getOrder: (id: string) => request<AdminOrderDetail>(`/mgmt/orders/${encodeURIComponent(id)}`),
  updateOrderStatus: (id: string, body: { status: string; note?: string; trackingNumber?: string; trackingUrl?: string }) =>
    request<{ success: true; status: string }>(`/mgmt/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify(body) }),
  addOrderNote: (id: string, note: string) =>
    request<{ success: true }>(`/mgmt/orders/${encodeURIComponent(id)}/notes`, { method: 'POST', body: JSON.stringify({ note }) }),
  bulkOrderStatus: (orderIds: string[], status: string) =>
    request<{ results: Array<{ id: string; ok: boolean; error?: string }> }>(`/mgmt/orders/bulk-status`, { method: 'POST', body: JSON.stringify({ orderIds, status }) }),

  // Custom orders
  listCustomOrders: (status?: string) =>
    request<{ customOrders: AdminCustomOrder[]; total: number }>(`/mgmt/custom-orders${status ? `?status=${status}` : ''}`),
  updateCustomOrder: (id: string, body: { status?: string; adminNote?: string }) =>
    request<AdminCustomOrder>(`/mgmt/custom-orders/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // Coupons
  listCoupons: () => request<{ coupons: AdminCoupon[] }>('/mgmt/coupons'),
  createCoupon: (data: Partial<AdminCoupon>) =>
    request<AdminCoupon>('/mgmt/coupons', { method: 'POST', body: JSON.stringify(data) }),
  updateCoupon: (code: string, data: Partial<AdminCoupon>) =>
    request<AdminCoupon>(`/mgmt/coupons/${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCoupon: (code: string) =>
    request<{ success: true }>(`/mgmt/coupons/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  couponRedemptions: (code: string) =>
    request<{ code: string; total: number; redemptions: unknown[] }>(`/mgmt/coupons/${encodeURIComponent(code)}/redemptions`),

  // Announcements
  listAnnouncements: () => request<{ announcements: AdminAnnouncement[] }>('/mgmt/announcements'),
  createAnnouncement: (data: Partial<AdminAnnouncement>) =>
    request<AdminAnnouncement>('/mgmt/announcements', { method: 'POST', body: JSON.stringify(data) }),
  updateAnnouncement: (id: string, data: Partial<AdminAnnouncement>) =>
    request<AdminAnnouncement>(`/mgmt/announcements/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAnnouncement: (id: string) =>
    request<{ success: true }>(`/mgmt/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Reviews
  listReviews: (status?: string) =>
    request<{ reviews: AdminReview[]; total: number }>(`/mgmt/reviews${status ? `?status=${status}` : ''}`),
  moderateReview: (id: string, action: 'approve' | 'reject') =>
    request<AdminReview>(`/mgmt/reviews/${encodeURIComponent(id)}/${action}`, { method: 'PATCH' }),

  // WhatsApp
  listConversations: () =>
    request<{ conversations: AdminWhatsappSummary[]; total: number }>('/mgmt/whatsapp/conversations'),
  getConversation: (phone: string) =>
    request<{ phone: string; messages: AdminWhatsappMessage[] }>(`/mgmt/whatsapp/conversations/${encodeURIComponent(phone)}`),
  markConversationRead: (phone: string) =>
    request<{ success: true; updated: number }>(`/mgmt/whatsapp/conversations/${encodeURIComponent(phone)}/read`, { method: 'POST' }),
  whatsappHealth: () =>
    request<AdminWhatsappHealth>('/mgmt/whatsapp/health'),

  // AI: generate product content from a public image URL
  aiGenerateFromUrl: (imageUrl: string) =>
    request<AiContent>('/mgmt/products/ai-generate', {
      method: 'POST',
      body: JSON.stringify({ imageUrl }),
    }),

  // AI: generate product content from a still-local file
  aiGenerateFromFile: async (file: File): Promise<AiContent> => {
    const token = getToken();
    const fd = new FormData();
    fd.append('file', file, file.name);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/mgmt/products/ai-generate-upload`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: fd,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new AdminApiError(`Cannot reach API at ${API_BASE} — ${detail}`, 0, err);
    }
    const body = await res.json().catch(() => undefined);
    if (!res.ok) {
      const errBody = body as { code?: string; error?: string } | undefined;
      const msg = errBody?.error ?? `AI generate failed (${res.status})`;
      const err = new AdminApiError(msg, res.status, body);
      // Preserve the code so the UI can map to a specific user message.
      (err as AdminApiError & { code?: string }).code = errBody?.code;
      throw err;
    }
    return body as AiContent;
  },

  // Image upload — multipart, returns the public blob URL
  uploadImage: async (file: File): Promise<{ url: string; blobName: string; size: number; contentType: string }> => {
    const token = getToken();
    const fd = new FormData();
    fd.append('file', file, file.name);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/mgmt/upload`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: fd,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new AdminApiError(`Cannot reach API at ${API_BASE} — ${detail}`, 0, err);
    }
    const body = await res.json().catch(() => undefined);
    if (!res.ok) {
      const msg = (body && typeof body === 'object' && 'error' in body) ? String((body as { error: string }).error) : `Upload failed (${res.status})`;
      throw new AdminApiError(msg, res.status, body);
    }
    return body;
  },
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
  cta?: string;
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
  contactName?: string;
  lastMessage: string;
  lastDirection: 'inbound' | 'outbound';
  lastTimestamp: string;
  unreadCount: number;
}

export interface AdminWhatsappHealth {
  lastWebhookReceivedAt: string | null;
  lastWebhookError: string | null;
  lastWebhookErrorAt: string | null;
  lastSendOkAt: string | null;
  lastSendError: string | null;
  lastSendErrorDetail: string | null;
  lastSendErrorAt: string | null;
  lastVerifyOkAt: string | null;
  lastVerifyError: string | null;
  lastVerifyErrorAt: string | null;
  configured: {
    accessToken: boolean;
    phoneNumberId: boolean;
    verifyToken: boolean;
    appSecret: boolean;
    wabaId: boolean;
  };
}

export type AiErrorCode =
  | 'MISSING_CONFIG'
  | 'AUTH_ERROR'
  | 'DEPLOYMENT_NOT_FOUND'
  | 'RATE_LIMIT'
  | 'SERVICE_UNAVAILABLE'
  | 'TIMEOUT'
  | 'IMAGE_PROCESSING_ERROR'
  | 'INVALID_RESPONSE'
  | 'CONTENT_VALIDATION_FAILED'
  | 'NETWORK_ERROR'
  | 'INVALID_INPUT'
  | 'INTERNAL_ERROR';

export interface AiContent {
  title: string;
  shortDescription: string;
  description: string;
  material: string;
  careInstructions: string;
}

export interface AdminWhatsappMessage {
  partitionKey: string;
  rowKey: string;
  direction: 'inbound' | 'outbound';
  body?: string;
  templateName?: string;
  status?: string;
  timestamp: string;
  read?: boolean;
  wamid?: string;
  type?: string;
  contactName?: string;
}
