import axios, { AxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import ENV from './env';
import { FAMILY_HEADER, clearScopeOnSessionLoss, familyHeaderFor, handleScopeError } from '@/utils/family-scope-link';

const api = axios.create({
  baseURL: ENV.API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// ── Auto-attach access token ──────────────────────────────────────────────
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('client_access_token');
  if (token && config.headers) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  // Inside a family, the routes that understand it are told which one. No header always means Personal.
  const family = familyHeaderFor(config.url);
  if (family && config.headers) config.headers[FAMILY_HEADER] = family;
  return config;
});

// ── Silent refresh on 401 ─────────────────────────────────────────────────
let isRefreshing = false;
let waitQueue: Array<{ resolve: (t: string) => void; reject: (e: any) => void }> = [];

function drainQueue(err: any, token: string | null) {
  waitQueue.forEach(p => (err ? p.reject(err) : p.resolve(token!)));
  waitQueue = [];
}

api.interceptors.response.use(
  res => res,
  async (error) => {
    // "You are not a member of that family (any more)": the scope provider switches back to Personal.
    if (handleScopeError(error)) return Promise.reject(error);
    const original: AxiosRequestConfig & { _retry?: boolean } = error.config ?? {};

    const is401 = error.response?.status === 401;
    const isRefreshUrl = original.url?.includes('/refresh');
    // Calls made while signed OUT: a 401 here is the real answer (wrong password, bad code), not an expired session.
    const PUBLIC_AUTH = ['/google-auth', '/apple-auth', '/facebook-auth', '/verify-email', '/passkey/login', '/client-auth/login', '/client-auth/register', '/resend-otp', '/forgot-password', '/verify-reset-otp', '/reset-password'];
    const isLoginUrl   = PUBLIC_AUTH.some(p => original.url?.includes(p));

    if (is401 && !original._retry && !isRefreshUrl && !isLoginUrl) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          waitQueue.push({ resolve, reject });
        }).then(token => {
          if (original.headers) original.headers['Authorization'] = `Bearer ${token}`;
          return api(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await SecureStore.getItemAsync('client_refresh_token');
        // Nothing to refresh with: pass the server's own answer on instead of hiding it.
        if (!refreshToken) { drainQueue(error, null); return Promise.reject(error); }

        const { data } = await api.post<{ accessToken: string; refreshToken: string }>(
          '/client-auth/refresh',
          { refreshToken },
        );

        await SecureStore.setItemAsync('client_access_token', data.accessToken);
        await SecureStore.setItemAsync('client_refresh_token', data.refreshToken);

        drainQueue(null, data.accessToken);

        if (original.headers) original.headers['Authorization'] = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshErr) {
        drainQueue(refreshErr, null);
        await SecureStore.deleteItemAsync('client_access_token');
        await SecureStore.deleteItemAsync('client_refresh_token');
        clearScopeOnSessionLoss();      // a saved family scope belongs to a login that no longer exists
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;
