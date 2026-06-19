import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { queryEntitiesAll, queryEntities, upsertEntity } from '../utils/tableStorage';
import { requireAdmin } from '../middleware/adminGuard';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function options(): HttpResponseInit { return { status: 204, headers: CORS_HEADERS }; }

interface WhatsappMessageEntity {
  partitionKey: string;   // phone number (E.164)
  rowKey: string;         // timestamp-based id
  direction: 'inbound' | 'outbound';
  body?: string;
  templateName?: string;
  status?: string;
  timestamp: string;
  read?: boolean;
  wamid?: string;
  type?: string;
  contactName?: string;
  [key: string]: unknown;
}

interface WhatsappHealthEntity {
  partitionKey: string;
  rowKey: string;
  lastWebhookReceivedAt?: string;
  lastWebhookError?: string;
  lastWebhookErrorAt?: string;
  lastSendOkAt?: string;
  lastSendError?: string;
  lastSendErrorDetail?: string;
  lastSendErrorAt?: string;
  lastVerifyOkAt?: string;
  lastVerifyError?: string;
  lastVerifyErrorAt?: string;
}

async function adminListConversations(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const all = await queryEntitiesAll<WhatsappMessageEntity>('whatsappMessages');
    const byPhone = new Map<string, { latest: WhatsappMessageEntity; unread: number; contactName?: string }>();
    for (const m of all) {
      const slot = byPhone.get(m.partitionKey);
      const isUnreadInbound = m.direction === 'inbound' && m.read !== true;
      if (!slot) {
        byPhone.set(m.partitionKey, {
          latest: m,
          unread: isUnreadInbound ? 1 : 0,
          contactName: m.contactName,
        });
      } else {
        if ((m.timestamp ?? '') > (slot.latest.timestamp ?? '')) slot.latest = m;
        if (isUnreadInbound) slot.unread++;
        if (!slot.contactName && m.contactName) slot.contactName = m.contactName;
      }
    }
    const conversations = Array.from(byPhone.entries()).map(([phone, s]) => ({
      phone,
      contactName: s.contactName ?? '',
      lastMessage: s.latest.body ?? s.latest.templateName ?? '',
      lastDirection: s.latest.direction,
      lastTimestamp: s.latest.timestamp,
      unreadCount: s.unread,
    })).sort((a, b) => (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? ''));
    return json({ conversations, total: conversations.length });
  } catch (err) {
    context.error('adminListConversations error', err);
    return json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
  }
}

async function adminGetConversation(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const phone = request.params.phone;
    if (!phone) return json({ error: 'phone is required' }, 400);
    const messages = await queryEntities<WhatsappMessageEntity>('whatsappMessages', `PartitionKey eq '${phone}'`);
    messages.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));
    return json({ phone, messages });
  } catch (err) {
    context.error('adminGetConversation error', err);
    return json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
  }
}

async function adminMarkConversationRead(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const phone = request.params.phone;
    if (!phone) return json({ error: 'phone is required' }, 400);
    const messages = await queryEntities<WhatsappMessageEntity>(
      'whatsappMessages',
      `PartitionKey eq '${phone}' and direction eq 'inbound'`,
    );
    let updated = 0;
    for (const m of messages) {
      if (m.read === true) continue;
      await upsertEntity('whatsappMessages', { ...m, read: true });
      updated++;
    }
    return json({ success: true, updated });
  } catch (err) {
    context.error('adminMarkConversationRead error', err);
    return json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
  }
}

async function adminGetHealth(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const rows = await queryEntities<WhatsappHealthEntity>(
      'whatsappHealth',
      `PartitionKey eq 'health' and RowKey eq 'singleton'`,
    );
    const h = rows[0];
    const configured = {
      accessToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
      phoneNumberId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
      verifyToken: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
      appSecret: Boolean(process.env.WHATSAPP_APP_SECRET),
      wabaId: Boolean(process.env.WHATSAPP_WABA_ID),
    };
    return json({
      lastWebhookReceivedAt: h?.lastWebhookReceivedAt ?? null,
      lastWebhookError: h?.lastWebhookError || null,
      lastWebhookErrorAt: h?.lastWebhookErrorAt || null,
      lastSendOkAt: h?.lastSendOkAt ?? null,
      lastSendError: h?.lastSendError || null,
      lastSendErrorDetail: h?.lastSendErrorDetail || null,
      lastSendErrorAt: h?.lastSendErrorAt || null,
      lastVerifyOkAt: h?.lastVerifyOkAt ?? null,
      lastVerifyError: h?.lastVerifyError || null,
      lastVerifyErrorAt: h?.lastVerifyErrorAt || null,
      configured,
    });
  } catch (err) {
    context.error('adminGetHealth error', err);
    return json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
  }
}

app.http('adminListConversations', { route: 'mgmt/whatsapp/conversations', methods: ['GET', 'OPTIONS'], authLevel: 'anonymous', handler: adminListConversations });
app.http('adminGetConversation', { route: 'mgmt/whatsapp/conversations/{phone}', methods: ['GET', 'OPTIONS'], authLevel: 'anonymous', handler: adminGetConversation });
app.http('adminMarkConversationRead', { route: 'mgmt/whatsapp/conversations/{phone}/read', methods: ['POST', 'OPTIONS'], authLevel: 'anonymous', handler: adminMarkConversationRead });
app.http('adminGetWhatsappHealth', { route: 'mgmt/whatsapp/health', methods: ['GET', 'OPTIONS'], authLevel: 'anonymous', handler: adminGetHealth });
