import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { templatesRepo } from '../lib/repositories';
import { TemplateEntity } from '../lib/types';

function json(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// GET /api/templates → list all local template catalog rows (sorted by name).
// POST /api/templates → upsert one template into the local catalog.
//
// Note: this is the local-cache table (whatsappTemplates), NOT Meta's template
// approval API. Outbound template messages still need an approved template on
// Meta's side; this table is for callers to discover what's wired up locally.
async function handler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === 'GET') {
    try {
      const items = await templatesRepo.list();
      return json({ count: items.length, items });
    } catch (err) {
      context.error('templatesRepo.list failed:', err);
      return json({ error: 'failed to list templates' }, 500);
    }
  }

  if (req.method === 'POST') {
    let body: Partial<TemplateEntity> & { name?: string };
    try {
      body = (await req.json()) as Partial<TemplateEntity> & { name?: string };
    } catch {
      return json({ error: 'invalid JSON body' }, 400);
    }

    const name = body.name ?? body.rowKey;
    if (!name || typeof name !== 'string') {
      return json({ error: '`name` is required' }, 400);
    }
    if (!body.body || typeof body.body !== 'string') {
      return json({ error: '`body` is required' }, 400);
    }

    const entity: TemplateEntity = {
      partitionKey: 'template',
      rowKey: name,
      body: body.body,
      description: body.description,
      variables: body.variables,
      status: body.status ?? 'active',
    };

    try {
      await templatesRepo.upsert(entity);
      context.log(`Template upserted: ${name}`);
      return json({ saved: true, name }, 200);
    } catch (err) {
      context.error('templatesRepo.upsert failed:', err);
      return json({ error: 'failed to save template' }, 500);
    }
  }

  return json({ error: 'Method Not Allowed' }, 405);
}

app.http('templatesApi', {
  methods: ['GET', 'POST'],
  authLevel: 'function',
  route: 'templates',
  handler,
});
