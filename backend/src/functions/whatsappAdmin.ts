import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { queryEntitiesAll, queryEntities } from '../utils/tableStorage';
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
  [key: string]: unknown;
}

async function adminListConversations(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  const auth = requireAdmin(request);
  if ('status' in auth) return auth;
  try {
    const all = await queryEntitiesAll<WhatsappMessageEntity>('whatsappMessages');
    // Group by phone, return latest message per phone
    const byPhone = new Map<string, WhatsappMessageEntity>();
    for (const m of all) {
      const existing = byPhone.get(m.partitionKey);
      if (!existing || (m.timestamp ?? '') > (existing.timestamp ?? '')) byPhone.set(m.partitionKey, m);
    }
    const conversations = Array.from(byPhone.entries()).map(([phone, latest]) => ({
      phone,
      lastMessage: latest.body ?? latest.templateName ?? '',
      lastDirection: latest.direction,
      lastTimestamp: latest.timestamp,
    })).sort((a, b) => (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? ''));
    return json({ conversations, total: conversations.length });
  } catch (err) {
    context.error('adminListConversations error', err);
    return json({ error: 'Internal server error' }, 500);
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
    return json({ error: 'Internal server error' }, 500);
  }
}

app.http('adminListConversations', { route: 'mgmt/whatsapp/conversations', methods: ['GET', 'OPTIONS'], authLevel: 'anonymous', handler: adminListConversations });
app.http('adminGetConversation', { route: 'mgmt/whatsapp/conversations/{phone}', methods: ['GET', 'OPTIONS'], authLevel: 'anonymous', handler: adminGetConversation });
