import * as SecureStore from 'expo-secure-store';
import api from '../api';

export const TOKEN_KEY = 'client_jwt_token';

export type ClientProfile = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string;
  googleId: string | null;
  isVerified: boolean;
  profileImage: string | null;
  isActive: boolean;
  isBiometric: boolean;
  isFaceRecognition: boolean;
  createdAt: string;
  updatedAt: string;
};

type AuthResult = { token: string; client: ClientProfile };

// ── Token helpers ─────────────────────────────────────────────────────────
export async function saveToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ── Register ──────────────────────────────────────────────────────────────
export async function registerClient(data: {
  firstName: string;
  lastName?: string;
  email: string;
  phone: string;
}): Promise<AuthResult> {
  const res = await api.post<AuthResult>('/client-auth/register', data);
  await saveToken(res.data.token);
  return res.data;
}

// ── Google Auth ───────────────────────────────────────────────────────────
export async function googleAuthClient(
  idToken: string,
  phone?: string,
): Promise<AuthResult> {
  const res = await api.post<AuthResult>('/client-auth/google-auth', {
    idToken,
    ...(phone ? { phone } : {}),
  });
  await saveToken(res.data.token);
  return res.data;
}

// ── Face Enroll ───────────────────────────────────────────────────────────
export async function enrollFace(imageUri: string): Promise<{ message: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    type: 'image/jpeg',
    name: 'face.jpg',
  } as any);

  const res = await api.post<{ message: string }>(
    '/client-auth/face-enroll',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data', ...authHeader(token) } },
  );
  return res.data;
}

// ── Face Identify (no email — backend scans all enrolled users) ───────────
export async function faceIdentify(imageUri: string): Promise<AuthResult> {
  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    type: 'image/jpeg',
    name: 'face.jpg',
  } as any);

  const res = await api.post<AuthResult>('/client-auth/face-identify', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  await saveToken(res.data.token);
  return res.data;
}

// ── Enable Biometric ──────────────────────────────────────────────────────
export async function enableBiometric(): Promise<void> {
  const token = await getToken();
  if (!token) return;
  await api.patch('/client-auth/enable-biometric', {}, {
    headers: authHeader(token),
  });
}

// ── Logout ────────────────────────────────────────────────────────────────
export async function logout(): Promise<void> {
  const token = await getToken();
  if (token) {
    try {
      await api.post('/client-auth/logout', {}, { headers: authHeader(token) });
    } catch { /* ignore server errors on logout */ }
  }
  await clearToken();
}

// ── Me ────────────────────────────────────────────────────────────────────
export async function getMe(): Promise<ClientProfile> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await api.get<ClientProfile>('/client-auth/me', {
    headers: authHeader(token),
  });
  return res.data;
}
