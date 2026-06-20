import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { contactsRepo } from '../lib/repositories';

function json(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// GET /api/contacts?limit=N    → most-recent-seen contacts (default 100, max 500)
// GET /api/contacts/{phone}    → single contact by E.164 / digits-only phone
async function listHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const limit = Number(req.query.get('limit') ?? '100');
  try {
    const items = await contactsRepo.list(Number.isFinite(limit) ? limit : 100);
    return json({ count: items.length, items });
  } catch (err) {
    context.error('contactsRepo.list failed:', err);
    return json({ error: 'failed to list contacts' }, 500);
  }
}

async function getHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const phone = req.params.phone;
  if (!phone) return json({ error: '`phone` path parameter is required' }, 400);

  try {
    const contact = await contactsRepo.get(phone);
    if (!contact) return json({ error: 'not found', phone }, 404);
    return json(contact);
  } catch (err) {
    context.error(`contactsRepo.get failed for ${phone}:`, err);
    return json({ error: 'failed to fetch contact' }, 500);
  }
}

app.http('contactsList', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'contacts',
  handler: listHandler,
});

app.http('contactsGet', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'contacts/{phone}',
  handler: getHandler,
});
