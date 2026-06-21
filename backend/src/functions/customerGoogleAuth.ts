import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { upsertCustomer } from '../utils/customerStore';
import { isValidEmail, normalizeEmail } from '../utils/identifiers';
import { recordLogin } from '../utils/auditLog';
import { issueCustomerToken } from './customerAuth';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
function options(): HttpResponseInit {
  return { status: 204, headers: CORS_HEADERS };
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
}

interface GoogleTokenInfo {
  aud?: string;
  scope?: string;
  expires_in?: string | number;
  email?: string;
  email_verified?: boolean | string;
}

/**
 * Verify a Google OAuth2 access token by hitting BOTH endpoints:
 *
 *   1. `tokeninfo` confirms the token is live AND was minted for this app's
 *      OAuth client id (the `aud` claim). Without this check, an access
 *      token minted for ANY other Google OAuth app could be replayed here —
 *      the classic OAuth confused-deputy.
 *   2. `userinfo` returns the profile (email, name, picture).
 *
 * Both are required; either failing fails the whole verification.
 */
async function verifyGoogleAccessToken(
  accessToken: string,
  expectedClientId: string,
): Promise<GoogleUserInfo | null> {
  try {
    const [tokenRes, userRes] = await Promise.all([
      fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      ),
      fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);
    if (!tokenRes.ok || !userRes.ok) return null;

    const tokenInfo = (await tokenRes.json()) as GoogleTokenInfo;
    if (!tokenInfo.aud || tokenInfo.aud !== expectedClientId) return null;

    return (await userRes.json()) as GoogleUserInfo;
  } catch {
    return null;
  }
}

// POST /api/auth/google   { accessToken, mobile? }
//
// The legacy `{ profile: { email, ... } }` branch is intentionally gone —
// it accepted a client-supplied identity with no verification (anyone could
// mint a session for any email). Only access tokens verified against
// Google with an audience check are accepted now.
async function customerGoogleAuth(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  if (!process.env.JWT_SECRET) {
    return json({ error: 'Server misconfigured: JWT_SECRET missing' }, 500);
  }
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
  if (!GOOGLE_CLIENT_ID) {
    return json({ error: 'Server misconfigured: GOOGLE_CLIENT_ID missing' }, 500);
  }

  try {
    const body = (await request.json()) as {
      accessToken?: string;
      mobile?: string;
    };

    if (!body.accessToken) {
      return json({ error: 'Missing Google access token.' }, 400);
    }
    const profile = await verifyGoogleAccessToken(body.accessToken, GOOGLE_CLIENT_ID);

    if (!profile?.email) {
      return json({ error: 'Could not verify Google account.' }, 401);
    }
    // Google sometimes returns the boolean as a string ("true"/"false").
    const emailVerified =
      profile.email_verified === true || profile.email_verified === 'true';
    if (!emailVerified) {
      return json({ error: 'Google account email is not verified.' }, 401);
    }
    const email = normalizeEmail(profile.email);
    if (!isValidEmail(email)) {
      return json({ error: 'Google returned an invalid email.' }, 400);
    }

    const { customer, created, mergedWith } = await upsertCustomer({
      email,
      name: profile.name?.trim() || email.split('@')[0],
      picture: profile.picture,
      mobile: body.mobile,
      provider: 'google',
      googleSub: profile.sub,
    });

    await recordLogin({
      userId: customer.email,
      email: customer.email,
      phone: customer.mobile,
      method: 'google',
      req: request,
    });

    const { token, expiresIn } = issueCustomerToken(customer);
    return json({
      token,
      expiresIn,
      user: { email: customer.email, name: customer.name, picture: customer.picture, mobile: customer.mobile },
      created,
      merged: !created,
      mergedWith,
    });
  } catch (err) {
    context.error('customerGoogleAuth error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

app.http('customerGoogleAuth', {
  route: 'auth/google',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: customerGoogleAuth,
});
