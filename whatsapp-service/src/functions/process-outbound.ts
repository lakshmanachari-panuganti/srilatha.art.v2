import { app, InvocationContext } from '@azure/functions';
import { metaSendMessage } from '../lib/meta';
import { messagesRepo, normalizePhone } from '../lib/repositories';
import { parseQueueMessage } from '../lib/storage';
import { OutboundJob } from '../lib/types';

const QUEUE_OUTBOUND = process.env.WHATSAPP_QUEUE_OUTBOUND ?? 'whatsapp-outbound';

function buildPayload(job: OutboundJob, phone: string): Record<string, unknown> {
  if (job.type === 'text') {
    return { to: phone, type: 'text', text: { body: job.text?.body ?? '' } };
  }
  return {
    to: phone,
    type: 'template',
    template: {
      name: job.template?.name,
      language: { code: job.template?.languageCode ?? 'en' },
      ...(job.template?.components ? { components: job.template.components } : {}),
    },
  };
}

async function handler(queueItem: unknown, context: InvocationContext): Promise<void> {
  const job = parseQueueMessage<OutboundJob>(queueItem);
  const now = new Date().toISOString();
  const phone = normalizePhone(job.to);

  const result = await metaSendMessage(buildPayload(job, phone));

  const rowKey = `${now}-${result.wamid ?? job.idempotencyKey ?? Math.random().toString(36).slice(2, 10)}`;
  const summary = job.type === 'text'
    ? job.text?.body ?? ''
    : `[template: ${job.template?.name}]`;

  try {
    await messagesRepo.insert({
      partitionKey: phone,
      rowKey,
      direction: 'outbound',
      wamid: result.wamid,
      type: job.type,
      body: summary,
      status: result.ok ? 'sent' : 'failed',
      read: true,
      timestamp: now,
      ...(result.ok ? {} : { errorDetail: result.errorDetail }),
    });
  } catch (err) {
    // Logging failure shouldn't trigger a re-send. Log loudly and continue.
    context.error('Failed to write outbound message row:', err);
  }

  if (!result.ok) {
    context.error(`Meta send failed (status=${result.status}) idempotencyKey=${job.idempotencyKey}: ${result.errorDetail}`);
    // Retry on transient failure (network, 429, 5xx). Permanent client errors
    // (4xx) are not retried — throwing would just burn the dequeue counter.
    if (result.status === 0 || result.status === 429 || result.status >= 500) {
      throw new Error(`Meta send retryable failure: ${result.errorDetail ?? 'unknown'}`);
    }
    return;
  }

  context.log(`Outbound sent: wamid=${result.wamid} to=${phone} type=${job.type}`);
}

app.storageQueue('processOutboundMessage', {
  queueName: QUEUE_OUTBOUND,
  connection: 'AzureWebJobsStorage',
  handler,
});
