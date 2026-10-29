/**
 * The HTTP client: adds the access token to every call and, when a signed-in call gets a 401, renews the
 * token once and retries it. Same behaviour as the Expo app's api.ts, with localStorage in place of SecureStore.
 */
import axios, { type AxiosRequestConfig } from 'axios';
import ENV from './env';
import { storage } from './storage';
import { FAMILY_HEADER, clearScopeOnSessionLoss, familyHeaderFor, handleScopeError } from '@/utils/family-scope-link';

export const ACCESS_TOKEN_KEY = 'client_access_token';
export const REFRESH_TOKEN_KEY = 'client_refresh_token';

const api = axios.create({
  baseURL: ENV.API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

api.interceptors.request.use(config => {
  const token = storage.get(ACCESS_TOKEN_KEY);
  if (token && config.headers) config.headers['Authorization'] = `Bearer ${token}`;
  // Inside a family, the routes that understand it are told which one. No header always means Personal.
  const family = familyHeaderFor(config.url);
  if (family && config.headers) config.headers[FAMILY_HEADER] = family;
  return config;
});

let isRefreshing = false;
let waitQueue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];
const drainQueue = (err: unknown, token: string | null) => {
  waitQueue.forEach(p => (err ? p.reject(err) : p.resolve(token!)));
  waitQueue = [];
};

/** Calls made while signed OUT: a 401 here is the real answer (wrong password, bad code), not an expired session. */
export const PUBLIC_AUTH = [
  '/face-identify', '/google-auth', '/apple-auth', '/facebook-auth', '/verify-email', '/passkey/login',
  '/client-auth/login', '/client-auth/register', '/resend-otp', '/forgot-password', '/verify-reset-otp', '/reset-password',
];

/** Set by the app so a failed refresh sends the user back to sign in. */
let onSessionLost: (() => void) | null = null;
export const setSessionLostHandler = (fn: (() => void) | null) => { onSessionLost = fn; };

api.interceptors.response.use(
  res => res,
  async error => {
    // "You are not a member of that family (any more)": the scope provider switches back to Personal.
    if (handleScopeError(error)) return Promise.reject(error);
    const original: AxiosRequestConfig & { _retry?: boolean } = error.config ?? {};
    const is401 = error.response?.status === 401;
    const isRefreshUrl = original.url?.includes('/refresh');
    const isPublic = PUBLIC_AUTH.some(p => original.url?.includes(p));

    if (is401 && !original._retry && !isRefreshUrl && !isPublic) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => { waitQueue.push({ resolve, reject }); }).then(token => {
          if (original.headers) original.headers['Authorization'] = `Bearer ${token}`;
          return api(original);
        });
      }

      original._retry = true;
      isRefreshing = true;
      try {
        const refreshToken = storage.get(REFRESH_TOKEN_KEY);
        // Nothing to refresh with: pass the server's own answer on instead of hiding it.
        if (!refreshToken) { drainQueue(error, null); return Promise.reject(error); }

        const { data } = await api.post<{ accessToken: string; refreshToken: string }>('/client-auth/refresh', { refreshToken });
        storage.set(ACCESS_TOKEN_KEY, data.accessToken);
        storage.set(REFRESH_TOKEN_KEY, data.refreshToken);
        drainQueue(null, data.accessToken);
        if (original.headers) original.headers['Authorization'] = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshErr) {
        drainQueue(refreshErr, null);
        storage.remove(ACCESS_TOKEN_KEY);
        storage.remove(REFRESH_TOKEN_KEY);
        clearScopeOnSessionLoss();      // a saved family scope belongs to a login that no longer exists
        onSessionLost?.();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

export default api;
