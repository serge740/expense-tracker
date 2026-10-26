import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import api from '@/api';
import { storage } from '@/lib/storage';

// The web app keeps its tokens in browser storage (here the in-memory fallback, since the tests run without a browser).
const store = {
  get client_refresh_token() { return storage.get('client_refresh_token') ?? undefined; },
  set client_refresh_token(v: string | undefined) { v === undefined ? storage.remove('client_refresh_token') : storage.set('client_refresh_token', v); },
  get client_access_token() { return storage.get('client_access_token') ?? undefined; },
};

const respond = (status: number, message: string) => async (config: any) => {
  const response = { status, statusText: String(status), data: { message }, headers: {}, config };
  if (status >= 400) throw Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, config, response });
  return response;
};
const calls: string[] = [];
const original = api.defaults.adapter;
beforeEach(() => { storage.remove('client_refresh_token'); storage.remove('client_access_token'); calls.length = 0; });
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
