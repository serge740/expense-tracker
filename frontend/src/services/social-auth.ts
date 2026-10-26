import { googleAuthClient, googleCodeClient } from '@/services/client-auth.service';

/**
 * Google sign-in on the web: Google's own popup (their "Sign in with Google" script) returns a one-time code, and the
 * server swaps it for the person's identity, because only the server holds the client secret. This is the same Google
 * web client the phone app uses. Facebook and Apple are not offered on the web.
 */
export type SocialKind = 'google' | 'facebook' | 'apple';

/** Public by design (it is visible in every Google sign-in page); the secret stays on the server. */
export const GOOGLE_CLIENT_ID = '936996911068-a2e2v1jjq9c7hmotp339l1spqe75g102.apps.googleusercontent.com';
const SCRIPT_URL = 'https://accounts.google.com/gsi/client';

type CodeResponse = { code?: string; error?: string };
type GoogleApi = {
  accounts: {
    id: {
      initialize(config: { client_id: string; callback: (r: { credential?: string }) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean; use_fedcm_for_prompt?: boolean; itp_support?: boolean }): void;
      prompt(): void;
      cancel(): void;
    };
    oauth2: {
      initCodeClient(config: {
        client_id: string; scope: string; ux_mode: 'popup';
        callback: (r: CodeResponse) => void;
        error_callback: (e: { type?: string; message?: string }) => void;
      }): { requestCode(): void };
    };
  };
};
const googleApi = () => (window as unknown as { google?: GoogleApi }).google;

let loading: Promise<void> | null = null;

/** Loads Google's script once. Called early (when the sign-in screen opens) so the click that follows can open the popup straight away. */
export function preloadGoogle(): Promise<void> {
  if (googleApi()?.accounts?.oauth2) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = SCRIPT_URL;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => { loading = null; tag.remove(); reject(new Error('Could not reach Google. Check your connection and try again.')); };
    document.head.appendChild(tag);
  });
  return loading;
}

/** Returns false if the person closed the popup. Throws on real errors. */
export async function signInWith(kind: SocialKind, phone?: string): Promise<boolean> {
  if (kind !== 'google') throw new Error('Please continue with Google, or use your email or phone and password.');
  await preloadGoogle();
  const api = googleApi();
  if (!api?.accounts?.oauth2) throw new Error('Google sign-in did not load. Please try again.');

  const code = await new Promise<string | null>((resolve, reject) => {
    api.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      ux_mode: 'popup',
      callback: r => (r.code ? resolve(r.code) : r.error === 'access_denied' ? resolve(null) : reject(new Error(r.error || 'Google sign-in failed'))),
      error_callback: e => (e.type === 'popup_closed' ? resolve(null) : reject(new Error(e.type === 'popup_failed_to_open' ? 'Your browser blocked the Google window. Allow pop-ups for this site and try again.' : e.message || 'Google sign-in failed'))),
    }).requestCode();
  });
  if (!code) return false;
  await googleCodeClient(code, phone);
  return true;
}

/**
* Google One Tap: the small "Continue as <name>" card Google shows when this browser has a Google account signed in.
* Returns a function that closes it (for when the screen goes away). Never throws: if Google cannot be reached or the
* person is not signed in to Google, nothing is shown. The card gives an ID token, which the server already knows how to check.
*/
export function startGoogleOneTap(onSignedIn: () => void): () => void {
  let stopped = false;
  void preloadGoogle().then(() => {
    const api = googleApi();
    if (stopped || !api?.accounts?.id) return;
    api.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      // Only on a tap of "Continue as ...": signing in without a click would surprise people on shared computers.
      auto_select: false,
      cancel_on_tap_outside: false,
      use_fedcm_for_prompt: true,
      itp_support: true,
      callback: r => {
        if (!r.credential) return;
        googleAuthClient(r.credential).then(() => { if (!stopped) onSignedIn(); }).catch(() => { /* the buttons below still work */ });
      },
    });
    api.accounts.id.prompt();
  }).catch(() => { /* offline: no card */ });
  return () => { stopped = true; googleApi()?.accounts?.id?.cancel(); };
}
