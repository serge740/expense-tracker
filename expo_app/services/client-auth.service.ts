import * as SecureStore from 'expo-secure-store';
import api from '../api';

export const ACCESS_TOKEN_KEY  = 'client_access_token';
export const REFRESH_TOKEN_KEY = 'client_refresh_token';

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

type AuthResult = { accessToken: string; refreshToken: string; client: ClientProfile };

// ── Token helpers ─────────────────────────────────────────────────────────
export async function saveTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ── Register (sends OTP + returns provisional tokens) ─────────────────────
export async function registerClient(data: {
  firstName: string;
  lastName?: string;
  email: string;
  phone: string;
}): Promise<{ message: string; accessToken: string; refreshToken: string }> {
  const res = await api.post<{ message: string; accessToken: string; refreshToken: string }>('/client-auth/register', data);
  return res.data;
}

// ── Verify Email OTP ──────────────────────────────────────────────────────
export async function verifyEmail(email: string, otp: string): Promise<AuthResult> {
  const res = await api.post<AuthResult>('/client-auth/verify-email', { email, otp });
  await saveTokens(res.data.accessToken, res.data.refreshToken);
  return res.data;
}

// ── Resend OTP ────────────────────────────────────────────────────────────
export async function resendOtp(email: string): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>('/client-auth/resend-otp', { email });
  return res.data;
}

// ── Google Auth ───────────────────────────────────────────────────────────
export async function googleAuthClient(idToken: string, phone?: string): Promise<AuthResult> {
  const res = await api.post<AuthResult>('/client-auth/google-auth', {
    idToken,
    ...(phone ? { phone } : {}),
  });
  await saveTokens(res.data.accessToken, res.data.refreshToken);
  return res.data;
}

// ── Face Enroll ───────────────────────────────────────────────────────────
export async function enrollFace(imageUri: string): Promise<{ message: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const formData = new FormData();
  formData.append('image', { uri: imageUri, type: 'image/jpeg', name: 'face.jpg' } as any);

  const res = await api.post<{ message: string }>(
    '/client-auth/face-enroll',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data', ...authHeader(token) } },
  );
  return res.data;
}

// ── Face Identify ─────────────────────────────────────────────────────────
export async function faceIdentify(imageUri: string): Promise<AuthResult> {
  const formData = new FormData();
  formData.append('image', { uri: imageUri, type: 'image/jpeg', name: 'face.jpg' } as any);

  const res = await api.post<AuthResult>('/client-auth/face-identify', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  await saveTokens(res.data.accessToken, res.data.refreshToken);
  return res.data;
}

// ── Enable Biometric ──────────────────────────────────────────────────────
export async function enableBiometric(): Promise<void> {
  const token = await getToken();
  if (!token) return;
  await api.patch('/client-auth/enable-biometric', {}, { headers: authHeader(token) });
}

// ── Logout ────────────────────────────────────────────────────────────────
export async function logout(): Promise<void> {
  const refreshToken = await getRefreshToken();
  try {
    await api.post('/client-auth/logout', { refreshToken: refreshToken ?? undefined });
  } catch { /* ignore server errors */ }
  await clearTokens();
}

// ── Me ────────────────────────────────────────────────────────────────────
export async function getMe(): Promise<ClientProfile> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await api.get<ClientProfile>('/client-auth/me', { headers: authHeader(token) });
  return res.data;
}

// ── Update Profile ────────────────────────────────────────────────────────
export async function updateProfile(data: {
  firstName?: string;
  lastName?: string;
  phone?: string;
}): Promise<ClientProfile> {
  const res = await api.patch<ClientProfile>('/client-auth/profile', data);
  return res.data;
}

// ── Upload Profile Image ──────────────────────────────────────────────────
export async function uploadProfileImage(imageUri: string): Promise<{ profileImage: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const formData = new FormData();
  formData.append('image', { uri: imageUri, type: 'image/jpeg', name: 'profile.jpg' } as any);

  const res = await api.post<{ profileImage: string }>(
    '/client-auth/profile/image',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data', ...authHeader(token) } },
  );
  return res.data;
}
