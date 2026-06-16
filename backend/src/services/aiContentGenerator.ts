/**
 * Azure OpenAI GPT-4o Vision — product content generation.
 *
 * Ported from C:\repos\The-Srilatha-Arts\backend\src\services\aiContentGenerator.ts
 * with the same error-code contract (frontend maps each code to a precise
 * user-facing message).
 */

export interface AiProductContent {
  title: string;
  shortDescription: string;
  description: string;
  material: string;
  careInstructions: string;
}

export type AiErrorCode =
  | 'MISSING_CONFIG'
  | 'AUTH_ERROR'
  | 'DEPLOYMENT_NOT_FOUND'
  | 'RATE_LIMIT'
  | 'SERVICE_UNAVAILABLE'
  | 'TIMEOUT'
  | 'IMAGE_PROCESSING_ERROR'
  | 'INVALID_RESPONSE'
  | 'CONTENT_VALIDATION_FAILED'
  | 'NETWORK_ERROR'
  | 'INVALID_INPUT'
  | 'INTERNAL_ERROR';

interface AiContentErrorOpts {
  status: number;
  azureStatus?: number;
  details?: string;
}

export class AiContentError extends Error {
  code: AiErrorCode;
  status: number;
  azureStatus?: number;
  details?: string;
  constructor(code: AiErrorCode, opts: AiContentErrorOpts) {
    super(code);
    this.name = 'AiContentError';
    this.code = code;
    this.status = opts.status;
    this.azureStatus = opts.azureStatus;
    this.details = opts.details;
  }
}

export type AiImageSource =
  | { kind: 'url'; url: string }
  | { kind: 'buffer'; buffer: Buffer; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' };

export interface GenerateResult {
  content: AiProductContent;
  deploymentName: string;
}

const PROMPT = [
  'You are an expert ecommerce content writer specializing in handmade artwork and home decor products.',
  '',
  'Analyze the uploaded artwork image and generate high-quality ecommerce content.',
  '',
  'Return ONLY valid JSON matching this schema:',
  '{',
  '  "title": "",',
  '  "shortDescription": "",',
  '  "description": "",',
  '  "material": "",',
  '  "careInstructions": ""',
  '}',
  '',
  'Rules:',
  '- Create an SEO-friendly product title (under 80 characters).',
  '- shortDescription must be under 160 characters — a single line, suitable for product cards.',
  '- description should be a detailed ecommerce product description (2–4 short paragraphs).',
  '- material: suggest likely materials used (e.g. "MDF · resin · gold leaf").',
  '- careInstructions: practical guidance for the buyer (avoid sunlight, dust with soft cloth, etc.).',
  '- Return JSON only — no markdown fences, no commentary, no leading or trailing prose.',
].join('\n');

export async function generateProductContent(source: string | AiImageSource): Promise<GenerateResult> {
  const src: AiImageSource = typeof source === 'string' ? { kind: 'url', url: source } : source;

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';

  if (!endpoint || !apiKey || !deployment) {
    const missing = [
      !endpoint && 'AZURE_OPENAI_ENDPOINT',
      !apiKey && 'AZURE_OPENAI_API_KEY',
      !deployment && 'AZURE_OPENAI_DEPLOYMENT_NAME',
    ].filter(Boolean).join(', ');
    throw new AiContentError('MISSING_CONFIG', { status: 503, details: `Missing env vars: ${missing}` });
  }

  let imageUrlForRequest: string;
  if (src.kind === 'url') {
    if (!src.url || !/^https?:\/\//.test(src.url)) {
      throw new AiContentError('INVALID_INPUT', { status: 400, details: 'imageUrl missing or not an http(s) URL' });
    }
    imageUrlForRequest = src.url;
  } else {
    if (!src.buffer || src.buffer.length === 0) {
      throw new AiContentError('INVALID_INPUT', { status: 400, details: 'image buffer missing or empty' });
    }
    imageUrlForRequest = `data:${src.mimeType};base64,${src.buffer.toString('base64')}`;
  }

  const trimmed = endpoint.replace(/\/+$/, '');
  const isFoundryV1 = /\.services\.ai\.azure\.com\b/i.test(trimmed);

  let url: string;
  let modelInBody: boolean;
  if (isFoundryV1) {
    const host = trimmed.replace(/(\.services\.ai\.azure\.com)\/.*$/i, '$1');
    url = `${host}/openai/v1/chat/completions`;
    modelInBody = true;
  } else {
    const host = trimmed.replace(/(\.openai\.azure\.com)\/.*$/i, '$1');
    url = `${host}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
    modelInBody = false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(modelInBody ? { Authorization: `Bearer ${apiKey}` } : { 'api-key': apiKey }),
      },
      body: JSON.stringify({
        ...(modelInBody ? { model: deployment } : {}),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: imageUrlForRequest } },
            ],
          },
        ],
        max_tokens: 900,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new AiContentError('TIMEOUT', { status: 504, details: '30s AbortController' });
    }
    throw new AiContentError('NETWORK_ERROR', {
      status: 502,
      details: err instanceof Error ? err.message : 'fetch rejected',
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const azureStatus = response.status;
    const rawBody = await response.text().catch(() => '');
    const bodyLower = rawBody.toLowerCase();
    const detail = `Azure ${azureStatus}: ${rawBody.slice(0, 500)}`;

    if (azureStatus === 401) {
      throw new AiContentError('AUTH_ERROR', { status: 401, azureStatus, details: detail });
    }
    if (azureStatus === 404 || bodyLower.includes('deploymentnotfound') || bodyLower.includes('deployment not found')) {
      throw new AiContentError('DEPLOYMENT_NOT_FOUND', { status: 404, azureStatus, details: detail });
    }
    if (azureStatus === 429) {
      throw new AiContentError('RATE_LIMIT', { status: 429, azureStatus, details: detail });
    }
    if (azureStatus >= 500) {
      throw new AiContentError('SERVICE_UNAVAILABLE', { status: 503, azureStatus, details: detail });
    }
    if (
      azureStatus === 400 &&
      (bodyLower.includes('image') || bodyLower.includes('download') ||
       bodyLower.includes('content_filter') || bodyLower.includes('format'))
    ) {
      throw new AiContentError('IMAGE_PROCESSING_ERROR', { status: 400, azureStatus, details: detail });
    }
    throw new AiContentError('INTERNAL_ERROR', { status: 502, azureStatus, details: detail });
  }

  let payload: { choices?: { message?: { content?: string } }[] };
  try {
    payload = (await response.json()) as typeof payload;
  } catch (err) {
    throw new AiContentError('INVALID_RESPONSE', {
      status: 502,
      details: err instanceof Error ? err.message : 'json parse failed',
    });
  }

  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new AiContentError('CONTENT_VALIDATION_FAILED', {
      status: 502,
      details: 'choices[0].message.content empty or non-string',
    });
  }

  const content = parseAndValidate(raw);
  return { content, deploymentName: deployment };
}

function parseAndValidate(raw: string): AiProductContent {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  let obj: unknown;
  try {
    obj = JSON.parse(stripped);
  } catch {
    throw new AiContentError('INVALID_RESPONSE', { status: 502, details: 'model output was not valid JSON' });
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new AiContentError('INVALID_RESPONSE', { status: 502, details: 'model output was not a JSON object' });
  }

  const o = obj as Record<string, unknown>;
  const get = (key: string): string => {
    const v = o[key];
    return typeof v === 'string' ? v.trim() : '';
  };

  const content: AiProductContent = {
    title: get('title').slice(0, 200),
    shortDescription: get('shortDescription').slice(0, 200),
    description: get('description').slice(0, 4000),
    material: get('material').slice(0, 300),
    careInstructions: get('careInstructions').slice(0, 1000),
  };

  if (!content.title || !content.shortDescription || !content.description) {
    const missing = [
      !content.title && 'title',
      !content.shortDescription && 'shortDescription',
      !content.description && 'description',
    ].filter(Boolean).join(', ');
    throw new AiContentError('CONTENT_VALIDATION_FAILED', {
      status: 502,
      details: `required fields empty after parse: ${missing}`,
    });
  }
  return content;
}
