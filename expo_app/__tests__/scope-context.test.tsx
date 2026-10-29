import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/services/family.service', () => ({ getMyFamily: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PERSONAL_ONLY, ScopeProvider, useScope, type ScopeValue } from '@/context/scope-context';
import { FAMILY_HEADER, clearScopeOnSessionLoss, familyHeaderFor, getActiveFamilyId, handleScopeError } from '@/utils/family-scope-link';
import { loadPendingInvite, savePendingInvite } from '@/utils/pending-invite';
import type { FamilyAction, FamilyRole } from '@/utils/family-permissions';

const family = require('@/services/family.service') as { getMyFamily: jest.Mock<() => Promise<any>> };
const mineOf = (role = 'OWNER', id = 'fam-12345678') => ({ family: { id, name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' }, role, memberCount: 3, limits: { maxMembers: 12, maxPendingInvites: 20, inviteDays: 7 } });

let latest: ScopeValue = PERSONAL_ONLY;
const Probe = () => { latest = useScope(); return null; };
const mount = async () => { await render(<ScopeProvider><Probe /></ScopeProvider>); await waitFor(() => expect(latest.ready).toBe(true)); };
const saved = () => AsyncStorage.getItem('family:scope');

beforeEach(async () => { jest.clearAllMocks(); await AsyncStorage.clear(); family.getMyFamily.mockResolvedValue(null); latest = PERSONAL_ONLY; });
afterEach(async () => { await cleanup(); clearScopeOnSessionLoss(); });

describe('starting the app', () => {
  test('no family and nothing saved: Personal, no header', async () => {
    await mount();
    expect(latest).toMatchObject({ scope: 'personal', isFamily: false, family: null, scopeKey: 'personal', notice: null });
    expect(getActiveFamilyId()).toBeNull();
  });
  test('Personal is not "ready" before the server has answered', async () => {
    let release: (v: any) => void = () => {};
    family.getMyFamily.mockReturnValue(new Promise(r => { release = r; }));
    await render(<ScopeProvider><Probe /></ScopeProvider>);
    expect(latest.ready).toBe(false);
    await act(async () => { release(null); });
    await waitFor(() => expect(latest.ready).toBe(true));
  });
  test('a saved family that the person is still in is restored, with the header on before anything is shown', async () => {
    await AsyncStorage.setItem('family:scope', 'fam-12345678');
    family.getMyFamily.mockResolvedValue(mineOf('MEMBER'));
    await mount();
    expect(latest).toMatchObject({ scope: 'family', isFamily: true, role: 'MEMBER', scopeKey: 'family:fam-12345678', notice: null });
    expect(familyHeaderFor('/wallets')).toBe('fam-12345678');
  });
  test('being in a family but not having chosen it starts in Personal', async () => {
    family.getMyFamily.mockResolvedValue(mineOf());
    await mount();
    expect(latest).toMatchObject({ scope: 'personal', family: { name: 'Mwiza Family' }, role: 'OWNER' });
    expect(getActiveFamilyId()).toBeNull();
  });
  test('a saved family the person was removed from: Personal, one notice, the saved choice forgotten', async () => {
    await AsyncStorage.setItem('family:scope', 'fam-12345678');
    family.getMyFamily.mockResolvedValue(null);
    await mount();
    expect(latest).toMatchObject({ scope: 'personal', notice: { kind: 'removed' } });
    expect(await saved()).toBeNull();
    expect(getActiveFamilyId()).toBeNull();
  });
  test('a saved family that is not the one they are in now (another account on this phone): Personal', async () => {
    await AsyncStorage.setItem('family:scope', 'fam-other-99999');
    family.getMyFamily.mockResolvedValue(mineOf());
    await mount();
    expect(latest.scope).toBe('personal');
    expect(await saved()).toBeNull();
  });
  test('offline: starts in Personal and keeps the saved choice for next time', async () => {
    await AsyncStorage.setItem('family:scope', 'fam-12345678');
    family.getMyFamily.mockRejectedValue(new Error('Network Error'));
    await mount();
    expect(latest.scope).toBe('personal');
    expect(await saved()).toBe('fam-12345678');
  });
});

describe('switching', () => {
  test('to the family and back: the header and the saved choice follow, and the screens are rebuilt each time', async () => {
    family.getMyFamily.mockResolvedValue(mineOf('ADMIN'));
    await mount();
    const e0 = latest.epoch;
    await act(async () => { await latest.switchTo('family'); });
    expect(latest).toMatchObject({ scope: 'family', role: 'ADMIN', scopeKey: 'family:fam-12345678' });
    expect(familyHeaderFor('/transactions')).toBe('fam-12345678');
    expect(await saved()).toBe('fam-12345678');
    const e1 = latest.epoch;
    expect(e1).toBeGreaterThan(e0);
    await act(async () => { await latest.switchTo('personal'); });
    expect(latest).toMatchObject({ scope: 'personal', scopeKey: 'personal' });
    expect(familyHeaderFor('/transactions')).toBeNull();
    expect(await saved()).toBeNull();
    expect(latest.epoch).toBeGreaterThan(e1);
  });
  test('switching to where you already are does nothing; switching to a family you do not have does nothing', async () => {
    await mount();
    const e = latest.epoch;
    await act(async () => { await latest.switchTo('personal'); await latest.switchTo('family'); });
    expect(latest.scope).toBe('personal');
    expect(latest.epoch).toBe(e);
  });
});

describe('what the role may do', () => {
  test('Personal is never restricted', async () => {
    family.getMyFamily.mockResolvedValue(mineOf('VIEWER'));
    await mount();
    expect(latest.can('tx.add')).toBe(true);
    expect(latest.can('wallet.delete')).toBe(true);
  });
  const roleCases: Array<[FamilyRole, FamilyAction, boolean]> = [
    ['OWNER', 'wallet.delete', true], ['ADMIN', 'wallet.delete', false], ['MEMBER', 'tx.add', true], ['MEMBER', 'wallet.manage', false],
    ['VIEWER', 'tx.add', false], ['VIEWER', 'family.view', true], ['ADMIN', 'budget.set', true], ['MEMBER', 'budget.set', false],
  ];
  test.each(roleCases)('in a family a %s asking for %s: %s', async (role, action, expected) => {
    await AsyncStorage.setItem('family:scope', 'fam-12345678');
    family.getMyFamily.mockResolvedValue(mineOf(role));
    await mount();
    expect(latest.can(action)).toBe(expected);
  });
});

describe('losing the family while using it', () => {
  test('a 403 NOT_A_MEMBER from any request switches to Personal once, with a notice, and forgets the choice', async () => {
    await AsyncStorage.setItem('family:scope', 'fam-12345678');
    family.getMyFamily.mockResolvedValueOnce(mineOf()).mockResolvedValue(null);
    await mount();
    const e = latest.epoch;
    const error = { response: { status: 403, data: { code: 'NOT_A_MEMBER' } }, config: { headers: { [FAMILY_HEADER]: 'fam-12345678' } } };
    await act(async () => { handleScopeError(error); handleScopeError(error); });
    await waitFor(() => expect(latest.scope).toBe('personal'));
    expect(latest.notice).toEqual({ kind: 'removed', familyName: 'Mwiza Family' });
    expect(latest.epoch).toBe(e + 1);
    expect(getActiveFamilyId()).toBeNull();
    expect(await saved()).toBeNull();
    await act(async () => { latest.clearNotice(); });
    expect(latest.notice).toBeNull();
  });
  test('refreshing and finding the family gone does the same', async () => {
    await AsyncStorage.setItem('family:scope', 'fam-12345678');
    family.getMyFamily.mockResolvedValueOnce(mineOf());
    await mount();
    family.getMyFamily.mockResolvedValue(null);
    await act(async () => { await latest.refresh(); });
    expect(latest).toMatchObject({ scope: 'personal', notice: { kind: 'removed' }, family: null });
  });
  test('refreshing with a changed role keeps the scope and updates the role', async () => {
    await AsyncStorage.setItem('family:scope', 'fam-12345678');
    family.getMyFamily.mockResolvedValueOnce(mineOf('MEMBER'));
    await mount();
    const e = latest.epoch;
    family.getMyFamily.mockResolvedValue(mineOf('ADMIN'));
    await act(async () => { await latest.refresh(); });
    expect(latest).toMatchObject({ scope: 'family', role: 'ADMIN' });
    expect(latest.epoch).toBe(e);
  });
  test('creating or joining while in Personal: refresh shows the family and stays in Personal until the person switches', async () => {
    await mount();
    family.getMyFamily.mockResolvedValue(mineOf('OWNER'));
    await act(async () => { await latest.refresh(); });
    expect(latest).toMatchObject({ scope: 'personal', family: { name: 'Mwiza Family' } });
    await act(async () => { await latest.switchTo('family'); });
    expect(latest.isFamily).toBe(true);
  });
});

describe('logging out', () => {
  test('forgets the scope, the saved choice and any invite waiting to be used', async () => {
    await AsyncStorage.setItem('family:scope', 'fam-12345678');
    family.getMyFamily.mockResolvedValue(mineOf());
    await mount();
    await savePendingInvite({ code: 'K7M2QX' });
    expect(await loadPendingInvite()).toEqual({ code: 'K7M2QX' });
    await act(async () => { clearScopeOnSessionLoss(); });
    await waitFor(() => expect(latest.ready).toBe(false));
    expect(await saved()).toBeNull();
    expect(getActiveFamilyId()).toBeNull();
    expect(await loadPendingInvite()).toBeNull();
  });
});

describe('outside a provider', () => {
  test('a screen sees plain Personal', async () => {
    const Lonely = () => { latest = useScope(); return null; };
    await render(<Lonely />);
    expect(latest).toBe(PERSONAL_ONLY);
    expect(latest.can('wallet.delete')).toBe(true);
  });
});
