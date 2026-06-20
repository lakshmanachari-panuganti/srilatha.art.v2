import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { messagesRepo } from '../lib/repositories';

function json(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// GET /api/messages?limit=N&phone=<digits>
//   → recent messages, optionally scoped to a single phone (Table partition).
// GET /api/messages/{id}
//   → lookup by WhatsApp message id (wamid) — what Meta returns/sends. Because
//     a single wamid can have both an inbound row and an outbound row when we
//     reply with the same wamid as reference, the response returns an array.
async function listHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const limit = Number(req.query.get('limit') ?? '100');
  const phone = req.query.get('phone') ?? undefined;
  try {
    const items = await messagesRepo.list(Number.isFinite(limit) ? limit : 100, phone);
    return json({ count: items.length, items });
  } catch (err) {
    context.error('messagesRepo.list failed:', err);
    return json({ error: 'failed to list messages' }, 500);
  }
}

async function getHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const id = req.params.id;
  if (!id) return json({ error: '`id` path parameter is required' }, 400);

  try {
    const rows = await messagesRepo.findByWamid(id);
    if (rows.length === 0) return json({ error: 'not found', id }, 404);
    return json({ count: rows.length, items: rows });
  } catch (err) {
    context.error(`messagesRepo.findByWamid failed for ${id}:`, err);
    return json({ error: 'failed to fetch message' }, 500);
  }
}

app.http('messagesList', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'messages',
  handler: listHandler,
});

app.http('messagesGet', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'messages/{id}',
  handler: getHandler,
});
