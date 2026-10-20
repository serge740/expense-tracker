import { create, get, isSupported } from 'react-native-passkeys';
import * as Device from 'expo-device';
import api from '../api';
import { saveTokens, ClientProfile } from './client-auth.service';

export const passkeysSupported = isSupported();

export type PasskeyInfo = {
  id: string;
  deviceName: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
};

type AuthResult = { accessToken: string; refreshToken: string; client: ClientProfile };

function deviceLabel(): string {
  return Device.deviceName || Device.modelName || 'Unknown device';
}

// ── Register a new passkey (user already signed in) ───────────────────────
export async function registerPasskey(): Promise<void> {
  const options = await api.post('/client-auth/passkey/register/options').then(r => r.data);
  const credential = await create(options);
  if (!credential) throw new Error('Passkey registration was cancelled');
  await api.post('/client-auth/passkey/register/verify', { deviceName: deviceLabel(), ...credential });
}

// ── Sign in with an existing passkey ───────────────────────────────────────
export async function loginWithPasskey(): Promise<AuthResult> {
  const { options, key } = await api.post('/client-auth/passkey/login/options').then(r => r.data);
  const response = await get(options);
  if (!response) throw new Error('Passkey sign-in was cancelled');
  const res = await api.post<AuthResult>('/client-auth/passkey/login/verify', { key, response });
  await saveTokens(res.data.accessToken, res.data.refreshToken);
  return res.data;
}

// ── Manage ──────────────────────────────────────────────────────────────────
export async function listPasskeys(): Promise<PasskeyInfo[]> {
  const res = await api.get<PasskeyInfo[]>('/client-auth/passkey');
  return res.data;
}

export async function deletePasskey(id: string): Promise<{ message: string }> {
  const res = await api.delete<{ message: string }>(`/client-auth/passkey/${id}`);
  return res.data;
}
