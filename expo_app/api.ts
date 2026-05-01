import axios, { AxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import ENV from './env';

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
    const original: AxiosRequestConfig & { _retry?: boolean } = error.config ?? {};

    const is401 = error.response?.status === 401;
    const isRefreshUrl = original.url?.includes('/refresh');
    const isLoginUrl   = original.url?.includes('/face-identify') || original.url?.includes('/google-auth') || original.url?.includes('/verify-email');

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
        if (!refreshToken) throw new Error('No refresh token stored');

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
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;
