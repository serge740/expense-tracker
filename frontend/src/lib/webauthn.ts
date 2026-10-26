/**
 * Passkeys through the browser's own WebAuthn API. The server speaks JSON with base64url strings
 * (the SimpleWebAuthn format); the browser wants ArrayBuffers. These helpers convert both ways.
 */

export function b64urlToBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function bufferToB64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const webauthnSupported = () =>
  typeof window !== 'undefined' && window.isSecureContext && 'PublicKeyCredential' in window && !!navigator.credentials;

type Json = Record<string, any>;

const decodeDescriptors = (list?: Json[]) => list?.map(c => ({ ...c, id: b64urlToBuffer(c.id) }));

/** Creates a passkey from the server's registration options. Returns the JSON the server verifies, or null if cancelled. */
export async function createCredential(options: Json): Promise<Json | null> {
  const publicKey = {
    ...options,
    challenge: b64urlToBuffer(options.challenge),
    user: { ...options.user, id: b64urlToBuffer(options.user.id) },
    excludeCredentials: decodeDescriptors(options.excludeCredentials),
  } as PublicKeyCredentialCreationOptions;

  let cred: PublicKeyCredential | null;
  try {
    cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  } catch (e) {
    if ((e as DOMException)?.name === 'NotAllowedError' || (e as DOMException)?.name === 'AbortError') return null;
    throw e;
  }
  if (!cred) return null;

  const response = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: bufferToB64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: bufferToB64url(response.clientDataJSON),
      attestationObject: bufferToB64url(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
  };
}

/** Signs in with an existing passkey from the server's authentication options. Returns the JSON the server verifies, or null if cancelled. */
export async function getCredential(options: Json): Promise<Json | null> {
  const publicKey = {
    ...options,
    challenge: b64urlToBuffer(options.challenge),
    allowCredentials: decodeDescriptors(options.allowCredentials),
  } as PublicKeyCredentialRequestOptions;

  let cred: PublicKeyCredential | null;
  try {
    cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  } catch (e) {
    if ((e as DOMException)?.name === 'NotAllowedError' || (e as DOMException)?.name === 'AbortError') return null;
    throw e;
  }
  if (!cred) return null;

  const response = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bufferToB64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: bufferToB64url(response.clientDataJSON),
      authenticatorData: bufferToB64url(response.authenticatorData),
      signature: bufferToB64url(response.signature),
      userHandle: response.userHandle ? bufferToB64url(response.userHandle) : undefined,
    },
  };
}
