import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  FAMILY_HEADER, SCOPED_PREFIXES, clearScopeOnSessionLoss, familyHeaderFor, getActiveFamilyId, handleScopeError, isScopedPath, onSessionLost,
  requestPath, setActiveFamilyId, setNotAMemberHandler,
} from '@/utils/family-scope-link';

beforeEach(() => { setActiveFamilyId(null); setNotAMemberHandler(null); });
afterEach(() => { setActiveFamilyId(null); setNotAMemberHandler(null); });

const notMember = (familyId: string | null) => ({
  response: { status: 403, data: { statusCode: 403, code: 'NOT_A_MEMBER' } },
  config: { headers: familyId ? { [FAMILY_HEADER]: familyId } : {} },
});

describe('which requests carry the header', () => {
  test('only the five scoped routes, with or without a query or an id', () => {
    for (const p of SCOPED_PREFIXES) {
      expect(isScopedPath(p)).toBe(true);
      expect(isScopedPath(`${p}/abc`)).toBe(true);
      expect(isScopedPath(`${p}?x=1`)).toBe(true);
    }
    expect(isScopedPath('/wallets/overview?base=RWF')).toBe(true);
    expect(isScopedPath('/transactions/history')).toBe(true);
    expect(isScopedPath('https://aby-expense.onrender.com/home/summary?month=10')).toBe(true);
  });
  test('never the personal-only, account or family routes, or a look-alike', () => {
    for (const p of ['/reminders/pending', '/notifications', '/receipts/scan', '/subcategories', '/client-auth/login', '/family/mine', '/family/join', '/devices', '/walletsfoo', '/transactionsx', '/', '', undefined]) {
      expect(isScopedPath(p as string | undefined)).toBe(false);
    }
  });
  test('the header value is the active family on a scoped route, nothing otherwise', () => {
    expect(familyHeaderFor('/wallets')).toBeNull();                       // Personal: no header
    setActiveFamilyId('fam-12345678');
    expect(familyHeaderFor('/wallets')).toBe('fam-12345678');
    expect(familyHeaderFor('/reminders/pending')).toBeNull();
    expect(familyHeaderFor('/family/mine')).toBeNull();
    setActiveFamilyId(null);
    expect(familyHeaderFor('/wallets')).toBeNull();
  });
  test('requestPath strips the host, the query and the fragment', () => {
    expect(requestPath('https://x.y/wallets?a=1#b')).toBe('/wallets');
    expect(requestPath('/home/summary?x')).toBe('/home/summary');
    expect(requestPath(undefined)).toBe('');
  });
});

describe('"you are not a member of that family"', () => {
  test('tells the handler once, clears the family at once, and ignores late answers from the old scope', () => {
    const handler = vi.fn();
    setNotAMemberHandler(handler as any);
    setActiveFamilyId('fam-12345678');
    expect(handleScopeError(notMember('fam-12345678'))).toBe(true);
    expect(handleScopeError(notMember('fam-12345678'))).toBe(true);       // a second request that was already in flight
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('fam-12345678');
    expect(getActiveFamilyId()).toBeNull();
  });
  test('an answer to a request from a different scope does not switch the current one', () => {
    const handler = vi.fn();
    setNotAMemberHandler(handler as any);
    setActiveFamilyId('fam-second-1234');
    handleScopeError(notMember('fam-first-12345'));
    handleScopeError(notMember(null));
    expect(handler).not.toHaveBeenCalled();
    expect(getActiveFamilyId()).toBe('fam-second-1234');
  });
  test('works with the header object axios uses, and ignores other errors', () => {
    const handler = vi.fn();
    setNotAMemberHandler(handler as any);
    setActiveFamilyId('fam-12345678');
    const axiosLike = { response: { status: 403, data: { code: 'NOT_A_MEMBER' } }, config: { headers: { get: (k: string) => (k === FAMILY_HEADER ? 'fam-12345678' : undefined) } } };
    expect(handleScopeError(axiosLike)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handleScopeError({ response: { status: 403, data: { code: 'FORBIDDEN_ACTION' } } })).toBe(false);
    expect(handleScopeError({ response: { status: 500, data: {} } })).toBe(false);
    expect(handleScopeError(null)).toBe(false);
  });
});

describe('losing the session', () => {
  test('clears the family and tells every listener, even if one of them breaks', () => {
    const a = vi.fn(() => { throw new Error('boom'); });
    const b = vi.fn();
    const offA = onSessionLost(a as any);
    const offB = onSessionLost(b as any);
    setActiveFamilyId('fam-12345678');
    clearScopeOnSessionLoss();
    expect(getActiveFamilyId()).toBeNull();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA(); offB();
    clearScopeOnSessionLoss();
    expect(b).toHaveBeenCalledTimes(1);          // unsubscribed
  });
});
