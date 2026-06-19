import { app, InvocationContext } from '@azure/functions';
import { contactsRepo, messagesRepo, normalizePhone } from '../lib/repositories';
import { parseQueueMessage } from '../lib/storage';
import { WhatsappIncomingMessage, WhatsappWebhookPayload } from '../lib/types';

const QUEUE_INBOUND = process.env.WHATSAPP_QUEUE_INBOUND ?? 'whatsapp-webhooks';

interface QueuedItem {
  rawBody: string;
  receivedAt: string;
}

function describeMessage(m: WhatsappIncomingMessage): { body: string; type: string } {
  const type = m.type ?? 'unknown';
  if (m.text?.body) return { body: m.text.body, type };
  if (m.button?.text) return { body: m.button.text, type };
  if (m.interactive?.button_reply?.title) return { body: m.interactive.button_reply.title, type };
  if (m.interactive?.list_reply?.title) return { body: m.interactive.list_reply.title, type };
  if (m.image?.caption) return { body: `[image] ${m.image.caption}`, type };
  if (m.image?.id) return { body: '[image]', type };
  if (m.video?.caption) return { body: `[video] ${m.video.caption}`, type };
  if (m.video?.id) return { body: '[video]', type };
  if (m.document?.filename) return { body: `[document] ${m.document.filename}`, type };
  if (m.document?.id) return { body: '[document]', type };
  if (m.audio?.id) return { body: '[audio]', type };
  if (m.sticker?.id) return { body: '[sticker]', type };
  if (m.location) return { body: `[location] ${m.location.latitude},${m.location.longitude}`, type };
  return { body: `[${type}]`, type };
}

async function handler(queueItem: unknown, context: InvocationContext): Promise<void> {
  const item = parseQueueMessage<QueuedItem>(queueItem);
  const receivedAt = item.receivedAt ?? new Date().toISOString();

  let payload: WhatsappWebhookPayload;
  try {
    payload = JSON.parse(item.rawBody) as WhatsappWebhookPayload;
  } catch (err) {
    context.error('Failed to parse webhook rawBody as JSON', err);
    // Throwing causes the runtime to retry. After maxDequeueCount it lands in
    // the poison queue, which is what we want for malformed payloads.
    throw err;
  }

  let messageCount = 0;
  let statusCount = 0;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const contactName = value.contacts?.[0]?.profile?.name;

      for (const m of value.messages ?? []) {
        const phone = normalizePhone(m.from);
        const tsIso = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : receivedAt;
        const { body, type } = describeMessage(m);
        try {
          await messagesRepo.insert({
            partitionKey: phone,
            rowKey: `${tsIso}-${m.id}`,
            direction: 'inbound',
            wamid: m.id,
            type,
            body,
            contactName,
            read: false,
            timestamp: tsIso,
          });
          await contactsRepo.upsertSeen(phone, contactName);
          messageCount++;
          context.log(`Inbound stored: ${m.id} from=${phone} type=${type}`);
        } catch (err) {
          context.error(`Failed to store inbound message ${m.id}`, err);
          throw err;
        }
      }

      for (const s of value.statuses ?? []) {
        try {
          const matches = await messagesRepo.findByWamid(s.id);
          const errorDetail = s.errors?.length
            ? s.errors.map(e => `${e.code} ${e.title}${e.message ? ` — ${e.message}` : ''}`).join('; ')
            : undefined;
          if (matches.length > 0) {
            for (const row of matches) {
              await messagesRepo.updateStatus(row, s.status, errorDetail);
            }
          } else {
            // Status arrived before the outbound row was written. Persist a
            // status-only row so we don't lose the information.
            await messagesRepo.insert({
              partitionKey: normalizePhone(s.recipient_id),
              rowKey: `status-${s.id}-${receivedAt}`,
              direction: 'outbound',
              wamid: s.id,
              type: 'status-only',
              body: '',
              status: s.status,
              timestamp: s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : receivedAt,
              read: true,
              ...(errorDetail ? { errorDetail } : {}),
            });
          }
          statusCount++;
          context.log(`Status applied: ${s.id} -> ${s.status}`);
        } catch (err) {
          context.error(`Failed to apply status ${s.id}`, err);
          throw err;
        }
      }
    }
  }

  context.log(`Inbound batch processed: ${messageCount} messages, ${statusCount} statuses`);
}

app.storageQueue('processInboundWebhook', {
  queueName: QUEUE_INBOUND,
  connection: 'AzureWebJobsStorage',
  handler,
});
