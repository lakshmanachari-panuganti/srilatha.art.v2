const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? 'v20.0';

export interface MetaSendResult {
  ok: boolean;
  wamid?: string;
  status: number;
  raw: string;
  errorDetail?: string;
}

// Calls Meta Graph WhatsApp Cloud API. Caller is responsible for the message
// payload shape (text vs template vs media). `messaging_product: 'whatsapp'`
// is added here so callers don't have to remember it.
export async function metaSendMessage(payload: Record<string, unknown>): Promise<MetaSendResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    return {
      ok: false,
      status: 0,
      raw: '',
      errorDetail: 'WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not configured',
    };
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const body = JSON.stringify({ messaging_product: 'whatsapp', ...payload });

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, raw: '', errorDetail: `fetch failed: ${detail}` };
  }

  const raw = await res.text().catch(() => '');
  if (!res.ok) {
    return { ok: false, status: res.status, raw, errorDetail: raw || `HTTP ${res.status}` };
  }

  let wamid: string | undefined;
  try {
    const parsed = JSON.parse(raw) as { messages?: Array<{ id?: string }> };
    wamid = parsed.messages?.[0]?.id;
  } catch {
    // Non-JSON success body — uncommon but not fatal.
  }
  return { ok: true, status: res.status, raw, wamid };
}
