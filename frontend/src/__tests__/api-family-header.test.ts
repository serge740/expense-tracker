import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import api from '@/api';
import { storage } from '@/lib/storage';
import { clearTokens } from '@/services/client-auth.service';
import { FAMILY_HEADER, getActiveFamilyId, onSessionLost, setActiveFamilyId, setNotAMemberHandler } from '@/utils/family-scope-link';

const seen: Array<{ url: string; header: unknown }> = [];
const original = api.defaults.adapter;
let answer: (config: any) => { status: number; data: unknown } = () => ({ status: 200, data: {} });

beforeEach(() => {
  seen.length = 0;
  storage.set('client_access_token', 'tok');
  storage.set('client_refresh_token', 'ref');
  setActiveFamilyId(null); setNotAMemberHandler(null);
  answer = () => ({ status: 200, data: {} });
  api.defaults.adapter = (async (config: any) => {
    seen.push({ url: config.url, header: config.headers?.get ? config.headers.get(FAMILY_HEADER) : config.headers?.[FAMILY_HEADER] });
    const r = answer(config);
    const response = { status: r.status, statusText: String(r.status), data: r.data, headers: {}, config };
    if (r.status >= 400) throw Object.assign(new Error(`Request failed with status code ${r.status}`), { isAxiosError: true, config, response });
    return response;
  }) as any;
});
afterEach(() => { api.defaults.adapter = original; setActiveFamilyId(null); setNotAMemberHandler(null); storage.remove('client_access_token'); storage.remove('client_refresh_token'); });

describe('the web request carries the family only where it should', () => {
  test('Personal: no request has the header', async () => {
    for (const url of ['/wallets', '/transactions', '/budget/current', '/reports/summary', '/home/summary', '/debts']) await api.get(url);
    expect(seen.every(s => !s.header)).toBe(true);
  });
  test('inside a family: the five scoped routes carry it, nothing else does', async () => {
    setActiveFamilyId('fam-12345678');
    for (const url of ['/wallets', '/wallets/overview', '/transactions/recent', '/budget/current', '/reports/by-category', '/home/summary']) await api.get(url);
    expect(seen.every(s => s.header === 'fam-12345678')).toBe(true);
    seen.length = 0;
    for (const url of ['/debts', '/scheduled', '/reminders/pending', '/notifications', '/family/mine', '/client-auth/me', '/receipts/scan', '/subcategories']) await api.get(url);
    expect(seen.every(s => !s.header)).toBe(true);
  });
  test('switching back to Personal stops sending it at once', async () => {
    setActiveFamilyId('fam-12345678');
    await api.get('/wallets');
    setActiveFamilyId(null);
    await api.get('/wallets');
    expect(seen.map(s => s.header)).toEqual(['fam-12345678', undefined]);
  });
});

describe('losing access while inside a family (web)', () => {
  test('one 403 NOT_A_MEMBER tells the app once and switches the header off', async () => {
    const handler = vi.fn();
    setNotAMemberHandler(handler as any);
    setActiveFamilyId('fam-12345678');
    answer = () => ({ status: 403, data: { statusCode: 403, code: 'NOT_A_MEMBER' } });
    const results = await Promise.allSettled([api.get('/wallets'), api.get('/transactions'), api.get('/home/summary')]);
    expect(results.every(r => r.status === 'rejected')).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(getActiveFamilyId()).toBeNull();
  });
  test('an ordinary 403 leaves the scope alone', async () => {
    const handler = vi.fn();
    setNotAMemberHandler(handler as any);
    setActiveFamilyId('fam-12345678');
    answer = () => ({ status: 403, data: { code: 'FORBIDDEN_ACTION' } });
    await expect(api.post('/transactions', {})).rejects.toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
    expect(getActiveFamilyId()).toBe('fam-12345678');
  });
});

describe('losing the login (web)', () => {
  test('logging out clears the family scope', () => {
    const listener = vi.fn();
    const off = onSessionLost(listener as any);
    setActiveFamilyId('fam-12345678');
    clearTokens();
    expect(getActiveFamilyId()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(storage.get('client_access_token')).toBeNull();
    off();
  });
  test('a failed token refresh clears it too', async () => {
    const listener = vi.fn();
    const off = onSessionLost(listener as any);
    setActiveFamilyId('fam-12345678');
    answer = () => ({ status: 401, data: { message: 'expired' } });
    await expect(api.get('/debts')).rejects.toBeTruthy();
    expect(getActiveFamilyId()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(storage.get('client_access_token')).toBeNull();
    off();
  });
});
