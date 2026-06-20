import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { requireAdmin } from '../middleware/adminGuard';

// Thin HTTP proxy in front of the standalone WhatsApp microservice.
// The microservice (whatsapp-service/, deployed to func-srilathaartwhatsappv2)
// owns the storage and business logic; this proxy preserves the existing
// /mgmt/whatsapp/* URLs the frontend already calls and the admin-guard auth
// layer, then forwards to the microservice using a function key kept in app
// settings.
//
// Why a proxy and not a direct frontend call:
//   1. Single auth surface — admin UI continues to use the existing admin
//      session cookie, never sees the microservice function key.
//   2. No CORS plumbing on the microservice side.
//   3. Lets us swap backends or add caching later without touching the UI.

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function options(): HttpResponseInit { return { status: 204, headers: CORS_HEADERS }; }

function serviceConfig(): { baseUrl: string; key: string } | { error: string } {
  const baseUrl = process.env.WHATSAPP_SERVICE_URL;
  const key = process.env.WHATSAPP_SERVICE_KEY;
  if (!baseUrl) return { error: 'WHATSAPP_SERVICE_URL not configured' };
  if (!key) return { error: 'WHATSAPP_SERVICE_KEY not configured' };
  return { baseUrl: baseUrl.replace(/\/+$/, ''), key };
}

async function proxy(
  path: string,
  method: 'GET' | 'POST',
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const cfg = serviceConfig();
  if ('error' in cfg) {
    context.error(cfg.error);
    return json({ error: cfg.error }, 500);
  }
  const url = `${cfg.baseUrl}${path}${path.includes('?') ? '&' : '?'}code=${encodeURIComponent(cfg.key)}`;
  try {
    const res = await fetch(url, { method });
    const text = await res.text();
    // Forward upstream body + status verbatim. Add CORS so the browser accepts it.
    return {
      status: res.status,
      headers: { ...CORS_HEADERS, 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
      body: text,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    context.error(`whatsapp-service proxy failed (${method} ${path}):`, err);
    return json({ error: 'whatsapp-service unreachable', detail }, 502);
  }
}

async function adminListConversations(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  return proxy('/api/conversations', 'GET', context);
}

async function adminGetConversation(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  const phone = request.params.phone;
  if (!phone) return json({ error: 'phone is required' }, 400);
  return proxy(`/api/conversations/${encodeURIComponent(phone)}`, 'GET', context);
}

async function adminMarkConversationRead(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  const phone = request.params.phone;
  if (!phone) return json({ error: 'phone is required' }, 400);
  return proxy(`/api/conversations/${encodeURIComponent(phone)}/read`, 'POST', context);
}

async function adminGetHealth(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  return proxy('/api/health', 'GET', context);
}

app.http('adminListConversations', { route: 'mgmt/whatsapp/conversations', methods: ['GET', 'OPTIONS'], authLevel: 'anonymous', handler: adminListConversations });
app.http('adminGetConversation', { route: 'mgmt/whatsapp/conversations/{phone}', methods: ['GET', 'OPTIONS'], authLevel: 'anonymous', handler: adminGetConversation });
app.http('adminMarkConversationRead', { route: 'mgmt/whatsapp/conversations/{phone}/read', methods: ['POST', 'OPTIONS'], authLevel: 'anonymous', handler: adminMarkConversationRead });
app.http('adminGetWhatsappHealth', { route: 'mgmt/whatsapp/health', methods: ['GET', 'OPTIONS'], authLevel: 'anonymous', handler: adminGetHealth });
