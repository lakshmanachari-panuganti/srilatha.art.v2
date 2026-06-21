import { wrapCors } from '../utils/cors';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { odata } from '@azure/data-tables';
import crypto from 'node:crypto';
import { upsertEntity, queryEntities } from '../utils/tableStorage';
import { sendWhatsApp } from './whatsapp';
import { recordIssue } from '../utils/issueLog';

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

// ---------------------------------------------------------------------------
// Verify Razorpay webhook signature
// ---------------------------------------------------------------------------
function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ---------------------------------------------------------------------------
// Move order between status partitions
// ---------------------------------------------------------------------------
const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'failed'];

async function findOrder(orderId: string): Promise<Record<string, unknown> | null> {
  for (const status of ORDER_STATUSES) {
    const results = await queryEntities(
      'orders',
      odata`PartitionKey eq ${status} and RowKey eq ${orderId}`,
    );
    if (results.length > 0) return results[0] as Record<string, unknown>;
  }
  return null;
}

async function updateOrderStatus(
  orderId: string,
  fromStatus: string,
  toStatus: string,
  extraFields: Record<string, unknown> = {},
): Promise<void> {
  // Find current order
  const results = await queryEntities(
    'orders',
    odata`PartitionKey eq ${fromStatus} and RowKey eq ${orderId}`,
  );
  if (results.length === 0) return;

  const order = results[0] as Record<string, unknown>;

  // Upsert with new PartitionKey (new status)
  await upsertEntity('orders', {
    ...order,
    partitionKey: toStatus,
    rowKey: orderId,
    status: toStatus,
    updatedAt: new Date().toISOString(),
    ...extraFields,
  });
}

// ---------------------------------------------------------------------------
// POST /api/razorpay/webhook
// ---------------------------------------------------------------------------
async function handleRazorpayWebhook(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    context.error('RAZORPAY_WEBHOOK_SECRET not configured');
    void recordIssue({
      service: 'razorpay-webhook',
      severity: 'critical',
      message: 'RAZORPAY_WEBHOOK_SECRET not configured',
      detail: 'Webhook calls from Razorpay will be rejected until the secret is set in app settings.',
      fingerprint: 'razorpay-webhook:not-configured',
    });
    return json({ error: 'Webhook not configured' }, 500);
  }

  // Read raw body for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature') ?? '';

  if (!signature) {
    return json({ error: 'Missing x-razorpay-signature header' }, 400);
  }

  // Verify signature
  try {
    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      context.warn('Invalid Razorpay webhook signature');
      // Bad-signature webhooks are usually attempts to forge events. Log as
      // an issue so a sudden spike is visible in the dashboard — one row
      // with count incrementing, not a flood.
      void recordIssue({
        service: 'razorpay-webhook',
        severity: 'warning',
        message: 'Razorpay webhook signature rejected',
        detail: 'A webhook with an invalid x-razorpay-signature was rejected. If this happens repeatedly the configured secret may be out of sync with Razorpay dashboard.',
        fingerprint: 'razorpay-webhook:signature',
      });
      return json({ error: 'Invalid signature' }, 400);
    }
  } catch {
    return json({ error: 'Signature verification failed' }, 400);
  }

  // Parse event
  let event: {
    event: string;
    payload?: {
      payment?: { entity?: { receipt?: string; id?: string; order_id?: string } };
    };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid JSON payload' }, 400);
  }

  const eventType = event.event;
  const paymentEntity = event.payload?.payment?.entity;
  const orderId = paymentEntity?.receipt ?? '';
  const paymentId = paymentEntity?.id ?? '';

  context.log(`Razorpay webhook: ${eventType}, orderId=${orderId}`);

  try {
    switch (eventType) {
      case 'payment.captured': {
        if (orderId) {
          // Update order status to confirmed
          await updateOrderStatus(orderId, 'pending', 'confirmed', {
            razorpayPaymentId: paymentId,
            paidAt: new Date().toISOString(),
          });

          // Log event
          await upsertEntity('orderEvents', {
            partitionKey: orderId,
            rowKey: `webhook-captured-${Date.now()}`,
            event: 'payment.captured',
            paymentId,
            createdAt: new Date().toISOString(),
          });

          // Notify admin via WhatsApp
          const adminNumber = process.env.WHATSAPP_ADMIN_NUMBER;
          if (adminNumber) {
            try {
              await sendWhatsApp(
                adminNumber,
                `✅ *Payment Captured*\n\nOrder: ${orderId}\nPayment ID: ${paymentId}\n\nPlease begin processing the order.`,
              );
            } catch (waErr) {
              context.warn('WhatsApp notification failed:', waErr);
            }
          }
        }
        break;
      }

      case 'payment.failed': {
        if (orderId) {
          await updateOrderStatus(orderId, 'pending', 'failed');

          await upsertEntity('orderEvents', {
            partitionKey: orderId,
            rowKey: `webhook-failed-${Date.now()}`,
            event: 'payment.failed',
            paymentId,
            createdAt: new Date().toISOString(),
          });
        }
        break;
      }

      case 'order.paid': {
        // Alias for payment.captured in some Razorpay plans
        if (orderId) {
          await updateOrderStatus(orderId, 'pending', 'confirmed', {
            razorpayPaymentId: paymentId,
            paidAt: new Date().toISOString(),
          });
        }
        break;
      }

      default:
        // Unknown event — log and acknowledge
        context.log(`Unhandled Razorpay event: ${eventType}`);
        break;
    }
  } catch (err: unknown) {
    context.error('Webhook processing error:', err);
    // Still return 200 so Razorpay doesn't retry indefinitely
  }

  return json({ received: true });
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
app.http('razorpayWebhook', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'razorpay/webhook',
  handler: wrapCors(handleRazorpayWebhook),
});
