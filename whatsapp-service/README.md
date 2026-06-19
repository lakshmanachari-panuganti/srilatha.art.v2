# whatsapp-service

Dedicated WhatsApp Cloud API microservice for Srilatha Art.

Deploys to **`func-srilathaartwhatsappv2`** (Function App) backed by **`stsrilathaartwhatsappv2`** (storage account). All Azure resources are assumed to exist already — this project does not provision anything.

## Architecture at a glance

```
                       ┌──────────────────┐
   Meta Cloud API ───► │ POST /webhooks/  │ ──► whatsapp-webhooks ──► processInboundWebhook
   (inbound messages,  │   whatsapp       │     (queue)               (writes messages + contacts)
    status callbacks)  │ verify HMAC      │
                       └──────────────────┘
                       ┌──────────────────┐
   Caller ──────────►  │ POST /messages/  │ ──► whatsapp-outbound ──► processOutboundMessage
   (admin portal,      │   send           │     (queue)               (calls Meta + writes messages)
    workflow, etc.)    │ function-key     │
                       └──────────────────┘
                       ┌──────────────────┐
   Meta verify ─────►  │ GET /webhooks/   │ ──► echoes hub.challenge if verify token matches
                       │   whatsapp       │
                       └──────────────────┘
```

The HTTP webhook handler does **only** signature validation + enqueue, so it returns 200 to Meta within milliseconds regardless of how slow downstream storage is. All persistence happens in the queue trigger.

Outbound sends are the same pattern in reverse: the caller's HTTP request only enqueues a job; the queue trigger actually talks to Meta and writes the row. This gives free retries, decoupling, and observability.

## Storage layout (already provisioned)

| Table | PartitionKey | RowKey | Purpose |
|---|---|---|---|
| `whatsappMessages` | phone (E.164 digits) | `<isoTimestamp>-<wamid>` | Full message log, both directions |
| `whatsappContacts` | `"contact"` | phone | Per-contact summary (name, message count, first/last seen) |
| `whatsappTemplates` | `"template"` | template name | Local cache / catalog of approved templates |
| `whatsappWebhookLogs` | `YYYY-MM-DD` | `<isoTimestamp>-<uuid>` | Every webhook hit (success, 403, 500) for auditing |

| Queue | Purpose |
|---|---|
| `whatsapp-webhooks` | Raw inbound webhook payloads awaiting persistence |
| `whatsapp-outbound` | Outbound send jobs awaiting the Meta API call |

## Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| `GET`  | `/api/webhooks/whatsapp` | anonymous | Meta verification handshake (echoes `hub.challenge`) |
| `POST` | `/api/webhooks/whatsapp` | anonymous + HMAC | Inbound events from Meta (validates `x-hub-signature-256`) |
| `POST` | `/api/messages/send`     | function-key | Outbound message — accepts `text` or `template` |

The webhook callback URL configured in the Meta Developer Portal must be exactly:

```
https://func-srilathaartwhatsappv2.azurewebsites.net/api/webhooks/whatsapp
```

### Outbound request shape

```json
// text
{
  "to": "+919999999999",
  "type": "text",
  "text": { "body": "Hello from Srilatha Art!" }
}

// template
{
  "to": "+919999999999",
  "type": "template",
  "template": {
    "name": "hello_world",
    "languageCode": "en_US"
  }
}
```

Response is **`202 Accepted`** with an `idempotencyKey` — the actual send happens asynchronously in the queue trigger. Status updates flow back via webhook and patch the same row by `wamid`.

## Environment variables

Set on the Function App (Configuration → Application Settings). All required unless noted.

| Name | Value |
|---|---|
| `AzureWebJobsStorage` | Connection string for `stsrilathaartwhatsappv2` |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Insights instance |
| `WHATSAPP_ACCESS_TOKEN` | Permanent system-user token from Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone-number ID from WhatsApp Manager |
| `WHATSAPP_WABA_ID` | WhatsApp Business Account ID |
| `WHATSAPP_APP_SECRET` | App secret used to sign webhook requests |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Arbitrary long random string — must match Meta portal |
| `WHATSAPP_GRAPH_VERSION` | *(optional)* default `v20.0` |
| `WHATSAPP_QUEUE_INBOUND` | *(optional)* default `whatsapp-webhooks` |
| `WHATSAPP_QUEUE_OUTBOUND` | *(optional)* default `whatsapp-outbound` |
| `TABLE_MESSAGES` | *(optional)* default `whatsappMessages` |
| `TABLE_CONTACTS` | *(optional)* default `whatsappContacts` |
| `TABLE_TEMPLATES` | *(optional)* default `whatsappTemplates` |
| `TABLE_WEBHOOK_LOGS` | *(optional)* default `whatsappWebhookLogs` |

## Local development

```bash
npm install
cp local.settings.json.example local.settings.json
# Fill in real values
npm run start
```

The function runtime serves on `http://localhost:7071`.

For the GET handshake locally:

```bash
curl "http://localhost:7071/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=test"
```

You can simulate a POST locally by computing the HMAC yourself:

```bash
BODY='{"object":"whatsapp_business_account","entry":[]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WHATSAPP_APP_SECRET" | awk '{print $2}')
curl -X POST http://localhost:7071/api/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: sha256=$SIG" \
  -d "$BODY"
```

## Deploy

From inside `whatsapp-service/`:

```bash
npm install
npm run deploy
```

That runs `npm run clean && npm run build && func azure functionapp publish func-srilathaartwhatsappv2`. The published bundle contains the compiled `dist/` plus runtime `node_modules`.

Verify after deploy:

```bash
# 1) GET handshake (wrong token → 403, proves the route is alive)
curl -i "https://func-srilathaartwhatsappv2.azurewebsites.net/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x"

# 2) GET handshake (right token → 200 echoing the challenge)
curl -i "https://func-srilathaartwhatsappv2.azurewebsites.net/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<real token>&hub.challenge=hello"
```

## Meta Developer Portal config

1. **WhatsApp → Configuration → Webhook**:
   - Callback URL: `https://func-srilathaartwhatsappv2.azurewebsites.net/api/webhooks/whatsapp`
   - Verify Token: same value you put in `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Click **Verify and Save** → must turn green
2. **Webhook fields → Subscribe to `messages`** (this is the easy step to forget — verifying alone does not subscribe you to anything).
3. Send a real WhatsApp message from any phone to the business number.

## Observability

Every webhook hit (success, 403, 500) is recorded as one row in `whatsappWebhookLogs`. You can scan that table in Storage Explorer to see the actual delivery state. Each row carries the response status, signature-validity, error reason if any, and a 500-char payload summary on success.

Every function invocation logs to Application Insights via the runtime auto-instrumentation. Search Application Insights → Logs:

```kusto
traces
| where operation_Name in ('webhooksWhatsapp', 'messagesSend', 'processInboundWebhook', 'processOutboundMessage')
| order by timestamp desc
```

## Failure semantics

| Where it fails | What happens |
|---|---|
| GET verify with bad token | 403, logged in `whatsappWebhookLogs`, Meta retries on its own schedule |
| POST with missing/invalid HMAC | 403, logged, Meta does **not** retry (correct) |
| POST after HMAC OK but enqueue fails | 500 returned to Meta → Meta retries |
| Inbound queue trigger throws | Up to 5 dequeue attempts (host.json), then poison queue (`whatsapp-webhooks-poison`) |
| Outbound Meta call returns 4xx | Logged as failed row, **no** retry (would be wasted) |
| Outbound Meta call returns 429 / 5xx / network err | Throw → queue retries up to 5×, then poison queue |
| Outbound row insert fails after successful Meta send | Loud log, no retry (message is already on its way) |
