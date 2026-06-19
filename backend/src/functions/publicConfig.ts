import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      // Browsers can cache for 5 minutes; CDN for 1 hour. Config flips rarely.
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
    },
    body: JSON.stringify(body),
  };
}

function options(): HttpResponseInit {
  return { status: 204, headers: CORS_HEADERS };
}

// GET /api/config/public
// Exposes the minimal set of public configuration the frontend needs at runtime
// so we can manage values like the Google OAuth client ID through Azure Function
// App > Configuration instead of baking them into the static build.
async function getPublicConfig(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  if (_request.method === 'OPTIONS') return options();

  return json({
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  });
}

app.http('getPublicConfig', {
  route: 'config/public',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: getPublicConfig,
});
