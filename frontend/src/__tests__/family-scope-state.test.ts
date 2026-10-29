import { describe, expect, test } from 'vitest';
import { decideLaunchScope, scopeKeyOf, stillInFamily } from '@/utils/family-scope-state';
import { detailParams } from '@/utils/tx-nav';
import type { MyFamily } from '@/services/family.service';
import type { Transaction } from '@/services/transaction.service';

const mine = (id = 'fam-12345678'): MyFamily => ({ family: { id, name: 'Mwiza', currency: 'RWF', timezone: 'UTC' }, role: 'MEMBER', memberCount: 3, limits: { maxMembers: 12, maxPendingInvites: 20, inviteDays: 7 } });

describe('decideLaunchScope', () => {
  test('a saved family the person is still in is restored', () => {
    expect(decideLaunchScope('fam-12345678', mine())).toEqual({ scope: 'family', removed: false });
  });
  test('nothing saved: Personal, and nothing to report, whether or not they have a family', () => {
    expect(decideLaunchScope(null, null)).toEqual({ scope: 'personal', removed: false });
    expect(decideLaunchScope(null, mine())).toEqual({ scope: 'personal', removed: false });
  });
  test('a saved family they are no longer in (or another account on this device): Personal, reported once', () => {
    expect(decideLaunchScope('fam-12345678', null)).toEqual({ scope: 'personal', removed: true });
    expect(decideLaunchScope('fam-12345678', mine('fam-other-99999'))).toEqual({ scope: 'personal', removed: true });
  });
});

describe('scopeKeyOf and stillInFamily', () => {
  test('the screens are keyed by it, so the two spaces never share one', () => {
    expect(scopeKeyOf('personal', null)).toBe('personal');
    expect(scopeKeyOf('personal', 'fam-12345678')).toBe('personal');
    expect(scopeKeyOf('family', 'fam-12345678')).toBe('family:fam-12345678');
    expect(scopeKeyOf('family', null)).toBe('personal');
    expect(scopeKeyOf('family', 'a')).not.toBe(scopeKeyOf('family', 'b'));
  });
  test('still in the family only when the server says the same one', () => {
    expect(stillInFamily('fam-12345678', mine())).toBe(true);
    expect(stillInFamily('fam-12345678', null)).toBe(false);
    expect(stillInFamily('fam-12345678', mine('fam-other-99999'))).toBe(false);
    expect(stillInFamily(null, mine())).toBe(false);
  });
});

describe('detailParams (what the detail screen is given)', () => {
  const tx = (over: Partial<Transaction> = {}): Transaction => ({
    id: 't1', type: 'EXPENSE', category: 'food', title: 'Groceries', subCategory: null, description: null, amount: -42300, date: '2030-10-20T10:00:00Z',
    walletId: 'fw1', receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null, ...over,
  } as Transaction);
  test('carries the row, and the author (and whether it is you) inside a family', () => {
    expect(detailParams(tx({ author: { clientId: 'grace', name: 'Grace Uwase', isYou: false } }))).toMatchObject({ id: 't1', title: 'Groceries', amount: '-42300', authorId: 'grace', authorName: 'Grace Uwase', authorIsYou: '' });
    expect(detailParams(tx({ author: { clientId: 'aline', name: 'Aline Uwase', isYou: true } })).authorIsYou).toBe('1');
  });
  test('a personal row has no author', () => {
    expect(detailParams(tx())).toMatchObject({ authorId: '', authorName: '', authorIsYou: '' });
  });
});
