/**
 * Google, Facebook and Apple sign-in. On the phone these use the operating system's own sign-in sheets;
 * on the web each provider needs its own browser flow and a web client ID, which are set up in a later step.
 * Until then the buttons show a clear message instead of failing silently.
 */
export type SocialKind = 'google' | 'facebook' | 'apple';

const NAMES: Record<SocialKind, string> = { google: 'Google', facebook: 'Facebook', apple: 'Apple' };

/** Returns false if the user cancelled. Throws on real errors. */
export async function signInWith(kind: SocialKind, _phone?: string): Promise<boolean> {
  throw new Error(`Sign in with ${NAMES[kind]} is not available on the web yet. Please use your email or phone and password.`);
}
