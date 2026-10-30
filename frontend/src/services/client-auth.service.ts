// Ported from expo_app/services/client-auth.service.ts
import { clearScopeOnSessionLoss } from '@/utils/family-scope-link';
import api, { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/lib/api';
import { storage } from '@/lib/storage';
import { unregisterPush } from './device.service';

export { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY };

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
  createdAt: string;
  updatedAt: string;
};

export type AuthResult = { accessToken: string; refreshToken: string; client: ClientProfile };

// ── Token helpers ─────────────────────────────────────────────────────────
export function saveTokens(accessToken: string, refreshToken: string) {
  storage.set(ACCESS_TOKEN_KEY, accessToken);
  storage.set(REFRESH_TOKEN_KEY, refreshToken);
}

export const getToken = (): string | null => storage.get(ACCESS_TOKEN_KEY);
export const getRefreshToken = (): string | null => storage.get(REFRESH_TOKEN_KEY);

export function clearTokens() {
  storage.remove(ACCESS_TOKEN_KEY);
  storage.remove(REFRESH_TOKEN_KEY);
  clearScopeOnSessionLoss();     // logging out ends a family scope too: the next login starts in Personal
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

/** Web: the one-time code from Google's popup, swapped for a session by the server (it holds the client secret). */
export async function googleCodeClient(code: string, phone?: string): Promise<AuthResult> {
  const res = await api.post<AuthResult>('/client-auth/google-code', { code, ...(phone ? { phone } : {}) });
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
  if (!getToken()) throw new Error('Not authenticated');

  // The picker gives a local address (blob:…); the server wants the file itself.
  const blob = await (await fetch(imageUri)).blob();
  const formData = new FormData();
  formData.append('image', new File([blob], 'profile.jpg', { type: blob.type || 'image/jpeg' }));

  // No Content-Type: the browser adds multipart/form-data with the right boundary.
  const res = await api.post<{ profileImage: string }>('/client-auth/profile/image', formData, { headers: { 'Content-Type': undefined as unknown as string } });
  return res.data;
}
