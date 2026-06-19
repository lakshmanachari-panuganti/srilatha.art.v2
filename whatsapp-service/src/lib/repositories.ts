import { odata, RestError } from '@azure/data-tables';
import * as crypto from 'node:crypto';
import { getTable } from './storage';
import { ContactEntity, MessageEntity, TemplateEntity, WebhookLogEntity } from './types';

const TABLE_MESSAGES = process.env.TABLE_MESSAGES ?? 'whatsappMessages';
const TABLE_CONTACTS = process.env.TABLE_CONTACTS ?? 'whatsappContacts';
const TABLE_TEMPLATES = process.env.TABLE_TEMPLATES ?? 'whatsappTemplates';
const TABLE_WEBHOOK_LOGS = process.env.TABLE_WEBHOOK_LOGS ?? 'whatsappWebhookLogs';

export function isoNow(): string { return new Date().toISOString(); }
export function newId(): string { return crypto.randomUUID(); }
export function dateKey(d = new Date()): string { return d.toISOString().slice(0, 10); }
export function normalizePhone(phone: string): string { return phone.replace(/[^0-9]/g, ''); }

function isNotFound(err: unknown): boolean {
  return err instanceof RestError && err.statusCode === 404;
}

// ─── Messages ───────────────────────────────────────────────────────────────
export const messagesRepo = {
  async insert(entity: MessageEntity): Promise<void> {
    const client = getTable(TABLE_MESSAGES);
    await client.upsertEntity(entity, 'Replace');
  },

  async findByWamid(wamid: string): Promise<MessageEntity[]> {
    if (!wamid) return [];
    const client = getTable(TABLE_MESSAGES);
    const results: MessageEntity[] = [];
    const iter = client.listEntities<MessageEntity>({ queryOptions: { filter: odata`wamid eq ${wamid}` } });
    for await (const row of iter) results.push(row);
    return results;
  },

  // Bounded scan. Table Storage cannot order by timestamp server-side, so the
  // caller treats this as "recent N" by sorting client-side. Hard cap 500.
  async list(limit: number, phone?: string): Promise<MessageEntity[]> {
    const client = getTable(TABLE_MESSAGES);
    const cap = Math.min(Math.max(limit, 1), 500);
    const filter = phone ? odata`PartitionKey eq ${normalizePhone(phone)}` : undefined;
    const results: MessageEntity[] = [];
    const iter = client.listEntities<MessageEntity>({ queryOptions: { filter } });
    for await (const row of iter) {
      results.push(row);
      if (results.length >= cap) break;
    }
    results.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
    return results;
  },

  async updateStatus(row: MessageEntity, status: string, errorDetail?: string): Promise<void> {
    const client = getTable(TABLE_MESSAGES);
    await client.upsertEntity({
      ...row,
      status,
      statusUpdatedAt: isoNow(),
      ...(errorDetail ? { errorDetail } : {}),
    }, 'Replace');
  },
};

// ─── Contacts ───────────────────────────────────────────────────────────────
export const contactsRepo = {
  async upsertSeen(phone: string, name?: string): Promise<void> {
    const client = getTable(TABLE_CONTACTS);
    const rowKey = normalizePhone(phone);
    const now = isoNow();
    let existing: ContactEntity | undefined;
    try {
      existing = await client.getEntity<ContactEntity>('contact', rowKey);
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
    const next: ContactEntity = existing
      ? {
          ...existing,
          name: (name && name.length > 0) ? name : existing.name,
          lastSeenAt: now,
          messageCount: (existing.messageCount ?? 0) + 1,
        }
      : {
          partitionKey: 'contact',
          rowKey,
          name,
          firstSeenAt: now,
          lastSeenAt: now,
          messageCount: 1,
        };
    await client.upsertEntity(next, 'Replace');
  },

  async get(phone: string): Promise<ContactEntity | null> {
    const client = getTable(TABLE_CONTACTS);
    try {
      return await client.getEntity<ContactEntity>('contact', normalizePhone(phone));
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  },

  async list(limit: number): Promise<ContactEntity[]> {
    const client = getTable(TABLE_CONTACTS);
    const cap = Math.min(Math.max(limit, 1), 500);
    const results: ContactEntity[] = [];
    const iter = client.listEntities<ContactEntity>();
    for await (const row of iter) {
      results.push(row);
      if (results.length >= cap) break;
    }
    results.sort((a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''));
    return results;
  },
};

// ─── Templates ──────────────────────────────────────────────────────────────
export const templatesRepo = {
  async upsert(entity: TemplateEntity): Promise<void> {
    const client = getTable(TABLE_TEMPLATES);
    await client.upsertEntity({ ...entity, updatedAt: isoNow() }, 'Replace');
  },
  async get(name: string): Promise<TemplateEntity | null> {
    const client = getTable(TABLE_TEMPLATES);
    try {
      return await client.getEntity<TemplateEntity>('template', name);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  },

  async list(): Promise<TemplateEntity[]> {
    const client = getTable(TABLE_TEMPLATES);
    const results: TemplateEntity[] = [];
    const iter = client.listEntities<TemplateEntity>();
    for await (const row of iter) results.push(row);
    results.sort((a, b) => a.rowKey.localeCompare(b.rowKey));
    return results;
  },
};

// ─── Webhook logs ───────────────────────────────────────────────────────────
export const webhookLogsRepo = {
  async log(entity: Omit<WebhookLogEntity, 'partitionKey' | 'rowKey'>): Promise<void> {
    const client = getTable(TABLE_WEBHOOK_LOGS);
    const ts = isoNow();
    const row: WebhookLogEntity = {
      ...entity,
      partitionKey: dateKey(),
      rowKey: `${ts}-${newId()}`,
    };
    await client.upsertEntity(row, 'Replace');
  },
};
