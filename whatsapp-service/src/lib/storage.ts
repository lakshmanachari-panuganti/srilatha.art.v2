import { TableClient } from '@azure/data-tables';
import { QueueClient, QueueServiceClient } from '@azure/storage-queue';

function connectionString(): string {
  const cs = process.env.AzureWebJobsStorage;
  if (!cs) throw new Error('AzureWebJobsStorage not configured');
  return cs;
}

export function getTable(name: string): TableClient {
  return TableClient.fromConnectionString(connectionString(), name);
}

export function getQueue(name: string): QueueClient {
  const svc = QueueServiceClient.fromConnectionString(connectionString());
  return svc.getQueueClient(name);
}

export async function enqueue(queueName: string, payload: unknown): Promise<void> {
  const queue = getQueue(queueName);
  // The Functions queue trigger expects base64-encoded UTF-8 JSON by default,
  // so encode it explicitly here. Trigger binding will decode and parse.
  const json = JSON.stringify(payload);
  const base64 = Buffer.from(json, 'utf-8').toString('base64');
  await queue.sendMessage(base64);
}

// Defensive parse for queue trigger input — works whether the runtime delivers
// the message as a parsed object, raw JSON string, or still-base64 string.
export function parseQueueMessage<T>(raw: unknown): T {
  if (raw && typeof raw === 'object') return raw as T;
  const str = String(raw ?? '');
  try {
    return JSON.parse(str) as T;
  } catch {
    try {
      return JSON.parse(Buffer.from(str, 'base64').toString('utf-8')) as T;
    } catch {
      throw new Error('queue message is not parseable JSON');
    }
  }
}
