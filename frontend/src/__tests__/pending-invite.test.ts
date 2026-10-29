import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { PENDING_MAX_AGE_MS, clearPendingInvite, loadPendingInvite, savePendingInvite } from '@/utils/pending-invite';

const TOKEN = 'abcDEF123_-abcDEF123_-abcd';

/** A stand-in for the browser's sessionStorage (the tests run without a browser). */
const makeSession = (blocked = false) => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => { if (blocked) throw new Error('blocked'); return data.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (blocked) throw new Error('blocked'); data.set(k, v); },
    removeItem: (k: string) => { if (blocked) throw new Error('blocked'); data.delete(k); },
  };
};
let session = makeSession();
beforeEach(() => { session = makeSession(); (globalThis as any).window = { sessionStorage: session }; });
afterEach(() => { delete (globalThis as any).window; });

describe('an invite waiting for sign-in (kept for this tab only)', () => {
  test('a code is kept in sessionStorage, read back, then cleared', async () => {
    await savePendingInvite({ code: 'K7M2QX' });
    expect(session.data.has('family:pending-invite')).toBe(true);
    expect(await loadPendingInvite()).toEqual({ code: 'K7M2QX' });
    await clearPendingInvite();
    expect(await loadPendingInvite()).toBeNull();
    expect(session.data.size).toBe(0);
  });
  test('a token is kept the same way', async () => {
    await savePendingInvite({ token: TOKEN });
    expect(await loadPendingInvite()).toEqual({ token: TOKEN });
  });
  test('it is forgotten after seven days', async () => {
    const t0 = 1_700_000_000_000;
    await savePendingInvite({ code: 'K7M2QX' }, t0);
    expect(await loadPendingInvite(t0 + PENDING_MAX_AGE_MS - 1000)).toEqual({ code: 'K7M2QX' });
    expect(await loadPendingInvite(t0 + PENDING_MAX_AGE_MS + 1000)).toBeNull();
    expect(session.data.size).toBe(0);
  });
  test('an empty invite is not saved', async () => {
    await savePendingInvite({});
    expect(session.data.size).toBe(0);
  });
  test('damaged or tampered storage is ignored; only a real token or code comes back', async () => {
    session.data.set('family:pending-invite', '{not json');
    expect(await loadPendingInvite()).toBeNull();
    session.data.set('family:pending-invite', JSON.stringify({ input: { code: 'NOT A CODE' }, savedAt: Date.now() }));
    expect(await loadPendingInvite()).toBeNull();
    session.data.set('family:pending-invite', JSON.stringify({ input: { token: 'x'.repeat(10) }, savedAt: Date.now() }));
    expect(await loadPendingInvite()).toBeNull();
  });
  test('blocked storage (a private window) never throws', async () => {
    (globalThis as any).window = { sessionStorage: makeSession(true) };
    await expect(savePendingInvite({ code: 'K7M2QX' })).resolves.toBeUndefined();
    expect(await loadPendingInvite()).toBeNull();
    await expect(clearPendingInvite()).resolves.toBeUndefined();
  });
  test('it is never written to localStorage, which would outlive the tab', async () => {
    const local = makeSession();
    (globalThis as any).window = { sessionStorage: session, localStorage: local };
    await savePendingInvite({ token: TOKEN });
    expect(local.data.size).toBe(0);
  });
});
