import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const store: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => store[k] ?? null,
  setItemAsync: async (k: string, v: string) => { store[k] = v; },
  deleteItemAsync: async (k: string) => { delete store[k]; },
}));

import api from '@/api';

const respond = (status: number, message: string) => async (config: any) => {
  const response = { status, statusText: String(status), data: { message }, headers: {}, config };
  if (status >= 400) throw Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, config, response });
  return response;
};
const calls: string[] = [];
const original = api.defaults.adapter;
beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; calls.length = 0; });
afterEach(() => { api.defaults.adapter = original; });
const use = (status: number, message: string) => {
  const inner = respond(status, message);
  api.defaults.adapter = (async (config: any) => { calls.push(config.url); return inner(config); }) as any;
};

describe('a failed sign-in shows the server\'s own message', () => {
  test.each(['/client-auth/login', '/client-auth/apple-auth', '/client-auth/facebook-auth', '/client-auth/forgot-password', '/client-auth/reset-password'])(
    '%s: a 401 comes back as is, and no refresh is attempted', async (url) => {
      use(401, 'Incorrect email/phone or password');
      await expect(api.post(url, {})).rejects.toMatchObject({ response: { status: 401, data: { message: 'Incorrect email/phone or password' } } });
      expect(calls).toEqual([url]);
    });
});

describe('a signed-in call that gets a 401', () => {
  test('with no refresh token, the server\'s own error is returned (not "No refresh token stored")', async () => {
    use(401, 'Invalid or expired token');
    await expect(api.get('/wallets')).rejects.toMatchObject({ response: { status: 401, data: { message: 'Invalid or expired token' } } });
    expect(calls).toEqual(['/wallets']);
  });

  test('with a refresh token, it refreshes once and retries', async () => {
    store.client_refresh_token = 'r1';
    let walletCalls = 0;
    api.defaults.adapter = (async (config: any) => {
      calls.push(config.url);
      if (config.url === '/client-auth/refresh') return { status: 200, statusText: 'OK', headers: {}, config, data: { accessToken: 'a2', refreshToken: 'r2' } };
      if (config.url === '/wallets' && walletCalls++ === 0) return respond(401, 'expired')(config);
      return { status: 200, statusText: 'OK', headers: {}, config, data: { ok: true } };
    }) as any;
    const res = await api.get('/wallets');
    expect(res.data).toEqual({ ok: true });
    expect(calls).toEqual(['/wallets', '/client-auth/refresh', '/wallets']);
    expect(store.client_access_token).toBe('a2');
  });
});
