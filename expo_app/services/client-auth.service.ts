import * as SecureStore from 'expo-secure-store';
import api from '../api';
import { unregisterPush } from './device.service';

export const ACCESS_TOKEN_KEY  = 'client_access_token';
export const REFRESH_TOKEN_KEY = 'client_refresh_token';

export type ClientProfile = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string;
  googleId: string | null;
  appleId?: string | null;
  facebookId?: string | null;
  isVerified: boolean;
  emailVerifiedAt?: string | null;
  phoneVerifiedAt?: string | null;
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

// ── Register (creates account immediately, returns tokens) ───────────────
export async function registerClient(data: {
  firstName: string;
  lastName?: string;
  email: string;
  phone: string;
  password?: string;
}): Promise<AuthResult> {
  const res = await api.post<AuthResult>('/client-auth/register', data);
  await saveTokens(res.data.accessToken, res.data.refreshToken);
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

// ── Email/phone + password login ──────────────────────────────────────────
export async function loginClient(identifier: string, password: string): Promise<AuthResult> {
  const res = await api.post<AuthResult>('/client-auth/login', { identifier, password });
  await saveTokens(res.data.accessToken, res.data.refreshToken);
  return res.data;
}

// ── Apple Auth ────────────────────────────────────────────────────────────
export async function appleAuthClient(identityToken: string, firstName?: string, lastName?: string): Promise<AuthResult> {
  const res = await api.post<AuthResult>('/client-auth/apple-auth', { identityToken, firstName, lastName });
  await saveTokens(res.data.accessToken, res.data.refreshToken);
  return res.data;
}

// ── Email / phone verification (signed-in user) ──────────────────────────
type SendResult = { sentTo: string; devNote?: string };

export async function sendVerificationCode(channel: 'email' | 'phone'): Promise<SendResult> {
  const res = await api.post<SendResult>(`/client-auth/verification/${channel}/send`);
  return res.data;
}

export async function confirmVerificationCode(channel: 'email' | 'phone', otp: string): Promise<ClientProfile> {
  const res = await api.post<ClientProfile>(`/client-auth/verification/${channel}/confirm`, { otp });
  return res.data;
}

// ── Facebook Auth ─────────────────────────────────────────────────────────
export async function facebookAuthClient(accessToken: string): Promise<AuthResult> {
  const res = await api.post<AuthResult>('/client-auth/facebook-auth', { accessToken });
  await saveTokens(res.data.accessToken, res.data.refreshToken);
  return res.data;
}

// ── Forgot password (OTP → reset token → new password) ────────────────────
export async function requestPasswordReset(identifier: string): Promise<{ message: string; sentTo: string }> {
  const res = await api.post<{ message: string; sentTo: string }>('/client-auth/forgot-password', { identifier });
  return res.data;
}

export async function verifyResetOtp(identifier: string, otp: string): Promise<{ resetToken: string }> {
  const res = await api.post<{ resetToken: string }>('/client-auth/verify-reset-otp', { identifier, otp });
  return res.data;
}

export async function resetPassword(resetToken: string, password: string): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>('/client-auth/reset-password', { resetToken, password });
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
  await unregisterPush(); // while the session is still valid
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
