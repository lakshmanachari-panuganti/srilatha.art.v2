import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { messagesRepo } from '../lib/repositories';

function json(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// GET /api/conversations
//   → aggregated summary, one row per phone, ordered by most-recent message
//     desc. Shape matches the backend admin proxy's expectation directly so
//     the proxy can forward the body untouched.
async function listHandler(_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const conversations = await messagesRepo.aggregateConversations();
    return json({ conversations, total: conversations.length });
  } catch (err) {
    context.error('aggregateConversations failed:', err);
    return json({ error: 'failed to list conversations' }, 500);
  }
}

// GET /api/conversations/{phone}
//   → all messages for one phone, oldest first (chat order).
async function detailHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const phone = req.params.phone;
  if (!phone) return json({ error: '`phone` path parameter is required' }, 400);
  try {
    const messages = await messagesRepo.listForPhone(phone);
    return json({ phone, messages });
  } catch (err) {
    context.error(`listForPhone failed for ${phone}:`, err);
    return json({ error: 'failed to fetch conversation' }, 500);
  }
}

// POST /api/conversations/{phone}/read
//   → flips all unread inbound rows for the phone to read=true. Returns the
//     count actually changed (already-read rows are skipped).
async function markReadHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const phone = req.params.phone;
  if (!phone) return json({ error: '`phone` path parameter is required' }, 400);
  try {
    const updated = await messagesRepo.markAllReadForPhone(phone);
    return json({ success: true, updated });
  } catch (err) {
    context.error(`markAllReadForPhone failed for ${phone}:`, err);
    return json({ error: 'failed to mark conversation read' }, 500);
  }
}

app.http('conversationsList', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'conversations',
  handler: listHandler,
});

app.http('conversationsDetail', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'conversations/{phone}',
  handler: detailHandler,
});

app.http('conversationsMarkRead', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'conversations/{phone}/read',
  handler: markReadHandler,
});
