import {
  HttpHandler,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';

/**
 * Origins permitted to call the API. Anything else gets the request served
 * (so non-browser clients are unaffected) but with no
 * `Access-Control-Allow-Origin` header reflected, which browsers treat as
 * a failed pre-flight / blocked response.
 *
 * Update this list when a new SWA host comes online (preview slots, custom
 * domains, etc.).
 */
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'https://www.srilatha.art',
  'https://srilatha.art',
  'https://www.lucky1.online',
  'https://orange-forest-042a5df00.7.azurestaticapps.net',
]);

const BASE_CORS_HEADERS: Record<string, string> = {
  Vary: 'Origin',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function allowedOriginFor(request: HttpRequest): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

/**
 * Wrap an HTTP handler so the response's CORS headers reflect the per-request
 * Origin against `ALLOWED_ORIGINS`. The handler's own `Access-Control-Allow-
 * Origin` header is overwritten — local helpers can keep emitting `*` and
 * this wrapper makes the final response correct.
 *
 * For unknown origins, no `Access-Control-Allow-Origin` is set, which the
 * browser treats as a CORS failure (the response still reaches non-browser
 * clients normally).
 */
export function wrapCors(handler: HttpHandler): HttpHandler {
  return async (
    request: HttpRequest,
    context: InvocationContext,
  ): Promise<HttpResponseInit> => {
    const allowOrigin = allowedOriginFor(request);

    if (request.method === 'OPTIONS') {
      return {
        status: 204,
        headers: {
          ...BASE_CORS_HEADERS,
          ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin } : {}),
        },
      };
    }

    const response = (await handler(request, context)) ?? {};
    const incomingHeaders = ((response as HttpResponseInit).headers ?? {}) as Record<string, string>;

    const headers: Record<string, string> = {
      ...incomingHeaders,
      ...BASE_CORS_HEADERS,
    };
    if (allowOrigin) {
      headers['Access-Control-Allow-Origin'] = allowOrigin;
    } else {
      // Local helpers emit `*`; remove it for unknown origins so the browser
      // treats the response as cross-origin blocked.
      delete headers['Access-Control-Allow-Origin'];
    }

    return { ...response, headers };
  };
}
