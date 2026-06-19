'use client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useGoogleClientId } from './RuntimeConfigProvider';

// GoogleOAuthProvider requires a clientId at mount. Until the runtime config
// has loaded we mount the provider with a sentinel so the React tree (and
// the useGoogleLogin hook context) stays consistent; the auth UI gates the
// actual click on whether a real client id is present.
const PLACEHOLDER_CLIENT_ID = 'unconfigured.apps.googleusercontent.com';

export default function GoogleAuthGate({ children }: { children: React.ReactNode }) {
  const clientId = useGoogleClientId() || PLACEHOLDER_CLIENT_ID;
  return (
    <GoogleOAuthProvider key={clientId} clientId={clientId}>
      {children}
    </GoogleOAuthProvider>
  );
}
