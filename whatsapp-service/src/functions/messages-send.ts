import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { enqueue } from '../lib/storage';
import { OutboundJob } from '../lib/types';

const QUEUE_OUTBOUND = process.env.WHATSAPP_QUEUE_OUTBOUND ?? 'whatsapp-outbound';

function json(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// POST /api/messages/send
// Auth: function-key (x-functions-key header or ?code= query param).
//
// Body:
//   { "to": "+919999999999", "type": "text", "text": { "body": "Hello!" } }
//   { "to": "+919999999999", "type": "template",
//     "template": { "name": "hello_world", "languageCode": "en_US" } }
//
// Behavior: validates input, enqueues the job, returns 202-equivalent JSON.
// The actual Meta API call happens in the outbound queue trigger so we get
// retries, decoupling, and observability for free.
async function handler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let body: Partial<OutboundJob>;
  try {
    body = (await req.json()) as Partial<OutboundJob>;
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const { to, type, text, template } = body;
  if (!to) return json({ error: '`to` is required (E.164 phone number)' }, 400);
  if (type !== 'text' && type !== 'template') {
    return json({ error: '`type` must be "text" or "template"' }, 400);
  }
  if (type === 'text' && !text?.body) {
    return json({ error: '`text.body` is required for text messages' }, 400);
  }
  if (type === 'template' && !template?.name) {
    return json({ error: '`template.name` is required for template messages' }, 400);
  }

  const idempotencyKey = body.idempotencyKey ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const job: OutboundJob = {
    to: to.replace(/[^0-9]/g, ''),
    type,
    text,
    template,
    idempotencyKey,
    enqueuedAt: new Date().toISOString(),
  };

  try {
    await enqueue(QUEUE_OUTBOUND, job);
    context.log(`Outbound job enqueued: key=${idempotencyKey} to=${job.to} type=${job.type}`);
    return json({ accepted: true, idempotencyKey }, 202);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    context.error('Failed to enqueue outbound job:', err);
    return json({ error: 'failed to enqueue outbound job', detail }, 500);
  }
}

app.http('messagesSend', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'messages/send',
  handler,
});
