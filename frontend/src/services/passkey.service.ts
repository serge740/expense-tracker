import api from '@/lib/api';
import { createCredential, getCredential, webauthnSupported } from '@/lib/webauthn';
import { saveTokens, type AuthResult } from './client-auth.service';

export const passkeysSupported = webauthnSupported();

export type PasskeyInfo = {
  id: string;
  deviceName: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
};

/** A readable name for this browser, stored with the passkey so you can tell your devices apart. */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

// ── Register a new passkey (user already signed in) ───────────────────────
export async function registerPasskey(): Promise<void> {
  const options = await api.post('/client-auth/passkey/register/options').then(r => r.data);
  const credential = await createCredential(options);
  if (!credential) throw new Error('Passkey registration was cancelled');
  await api.post('/client-auth/passkey/register/verify', { deviceName: deviceLabel(), ...credential });
}

// ── Sign in with an existing passkey ───────────────────────────────────────
export async function loginWithPasskey(): Promise<AuthResult> {
  const { options, key } = await api.post('/client-auth/passkey/login/options').then(r => r.data);
  const response = await getCredential(options);
  if (!response) throw new Error('Passkey sign-in was cancelled');
  const res = await api.post<AuthResult>('/client-auth/passkey/login/verify', { key, response });
  saveTokens(res.data.accessToken, res.data.refreshToken);
  return res.data;
}

// ── Manage ──────────────────────────────────────────────────────────────────
export async function listPasskeys(): Promise<PasskeyInfo[]> {
  return (await api.get<PasskeyInfo[]>('/client-auth/passkey')).data;
}

export async function deletePasskey(id: string): Promise<{ message: string }> {
  return (await api.delete<{ message: string }>(`/client-auth/passkey/${id}`)).data;
}
