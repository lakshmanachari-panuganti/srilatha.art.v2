export type MessageDirection = 'inbound' | 'outbound';

export interface MessageEntity {
  partitionKey: string;
  rowKey: string;
  direction: MessageDirection;
  wamid?: string;
  type: string;
  body: string;
  status?: string;
  statusUpdatedAt?: string;
  read?: boolean;
  contactName?: string;
  timestamp: string;
  errorDetail?: string;
  [key: string]: unknown;
}

export interface ContactEntity {
  partitionKey: 'contact';
  rowKey: string;
  name?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  messageCount: number;
}

export interface TemplateEntity {
  partitionKey: 'template';
  rowKey: string;
  description?: string;
  variables?: string;
  body: string;
  status?: string;
  updatedAt?: string;
}

export interface WebhookLogEntity {
  partitionKey: string;
  rowKey: string;
  method: 'GET' | 'POST';
  status: number;
  signatureValid?: boolean;
  error?: string;
  messageCount?: number;
  statusCount?: number;
  payloadSummary?: string;
}

export interface WhatsappWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: WhatsappIncomingMessage[];
        statuses?: WhatsappStatusUpdate[];
      };
    }>;
  }>;
}

export interface WhatsappIncomingMessage {
  id: string;
  from: string;
  timestamp: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  image?: { caption?: string; id?: string };
  video?: { caption?: string; id?: string };
  document?: { filename?: string; id?: string };
  audio?: { id?: string };
  sticker?: { id?: string };
  location?: { latitude?: number; longitude?: number };
}

export interface WhatsappStatusUpdate {
  id: string;
  recipient_id: string;
  status: string;
  timestamp: string;
  errors?: Array<{ code: number; title: string; message?: string }>;
}

export interface OutboundJob {
  to: string;
  type: 'text' | 'template';
  text?: { body: string };
  template?: {
    name: string;
    languageCode?: string;
    components?: unknown[];
  };
  idempotencyKey?: string;
  enqueuedAt?: string;
}
