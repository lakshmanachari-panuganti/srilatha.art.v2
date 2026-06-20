import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getQueue, getTable } from '../lib/storage';

const QUEUE_INBOUND = process.env.WHATSAPP_QUEUE_INBOUND ?? 'whatsapp-webhooks';
const QUEUE_OUTBOUND = process.env.WHATSAPP_QUEUE_OUTBOUND ?? 'whatsapp-outbound';
const TABLE_MESSAGES = process.env.TABLE_MESSAGES ?? 'whatsappMessages';
const TABLE_CONTACTS = process.env.TABLE_CONTACTS ?? 'whatsappContacts';
const TABLE_TEMPLATES = process.env.TABLE_TEMPLATES ?? 'whatsappTemplates';
const TABLE_WEBHOOK_LOGS = process.env.TABLE_WEBHOOK_LOGS ?? 'whatsappWebhookLogs';

type CheckResult = { ok: true } | { ok: false; error: string };

async function checkTable(name: string): Promise<CheckResult> {
  try {
    await getTable(name).getEntity('__healthcheck__', '__healthcheck__').catch((err: unknown) => {
      const status = (err as { statusCode?: number })?.statusCode;
      // 404 is the expected "table reachable, row absent" response.
      if (status === 404) return undefined;
      throw err;
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkQueue(name: string): Promise<CheckResult & { approxCount?: number }> {
  try {
    const props = await getQueue(name).getProperties();
    return { ok: true, approxCount: props.approximateMessagesCount };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handler(_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const startedAt = Date.now();
  const [tMessages, tContacts, tTemplates, tWebhookLogs, qInbound, qOutbound] = await Promise.all([
    checkTable(TABLE_MESSAGES),
    checkTable(TABLE_CONTACTS),
    checkTable(TABLE_TEMPLATES),
    checkTable(TABLE_WEBHOOK_LOGS),
    checkQueue(QUEUE_INBOUND),
    checkQueue(QUEUE_OUTBOUND),
  ]);

  const tables = {
    [TABLE_MESSAGES]: tMessages,
    [TABLE_CONTACTS]: tContacts,
    [TABLE_TEMPLATES]: tTemplates,
    [TABLE_WEBHOOK_LOGS]: tWebhookLogs,
  };
  const queues = {
    [QUEUE_INBOUND]: qInbound,
    [QUEUE_OUTBOUND]: qOutbound,
  };

  const allOk =
    Object.values(tables).every(r => r.ok) &&
    Object.values(queues).every(r => r.ok);

  const body = {
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    version: process.env.WEBSITE_SITE_NAME ?? 'whatsapp-service',
    environment: {
      functionAppName: process.env.WEBSITE_SITE_NAME,
      region: process.env.REGION_NAME,
      runtime: `node ${process.versions.node}`,
      functionsExtensionVersion: process.env.FUNCTIONS_EXTENSION_VERSION,
      appInsightsConfigured: Boolean(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING),
    },
    // Per-credential booleans — admin UI uses this to show which Meta secret
    // is missing if any. Names match the env-var stems for easy diagnosis.
    configured: {
      accessToken:   Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
      phoneNumberId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
      verifyToken:   Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
      appSecret:     Boolean(process.env.WHATSAPP_APP_SECRET),
      wabaId:        Boolean(process.env.WHATSAPP_WABA_ID),
    },
    tables,
    queues,
  };

  if (!allOk) context.warn(`Health check degraded: ${JSON.stringify({ tables, queues })}`);
  return {
    status: allOk ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler,
});
