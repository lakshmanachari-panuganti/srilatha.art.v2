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
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

async function verifyGoogleAccessToken(accessToken: string): Promise<GoogleUserInfo | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as GoogleUserInfo;
  } catch {
    return null;
  }
}

// POST /api/auth/google   { accessToken } or { profile: { email, name, picture, sub } }
async function customerGoogleAuth(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options();
  if (!process.env.JWT_SECRET) {
    return json({ error: 'Server misconfigured: JWT_SECRET missing' }, 500);
  }

  try {
    const body = (await request.json()) as {
      accessToken?: string;
      profile?: GoogleUserInfo;
      mobile?: string;
    };

    let profile: GoogleUserInfo | null = null;
    if (body.accessToken) {
      profile = await verifyGoogleAccessToken(body.accessToken);
    } else if (body.profile?.email) {
      profile = body.profile;
    }

    if (!profile?.email) {
      return json({ error: 'Could not verify Google account.' }, 401);
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
