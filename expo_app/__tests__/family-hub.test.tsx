import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
    useFocusEffect: (cb: () => void) => { React.useEffect(cb, [cb]); },
  };
});
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', surface: '#FFFFFF', primary: '#5B3FD0', primaryBg: 'rgba(91,63,208,0.1)', buttonBg: '#5B3FD0', headerBg: '#5B3FD0',
    text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9', border: 'rgba(0,98,127,0.12)', inputBg: '#F3F8FA', isDark: false,
  }),
}));
jest.mock('@/services/family.service', () => ({
  getMembers: jest.fn(), getActivity: jest.fn(), getInvites: jest.fn(), createInvite: jest.fn(), revokeInvite: jest.fn(), revokeAllInvites: jest.fn(),
  removeMember: jest.fn(), setMemberRole: jest.fn(), transferOwnership: jest.fn(), updateFamily: jest.fn(), deleteFamily: jest.fn(),
}));
const mockScope: { value: any } = { value: {} };
jest.mock('@/context/scope-context', () => ({ useScope: () => mockScope.value }));

import FamilyHubScreen from '@/app/(dashboard)/family';

const { router } = require('expo-router') as { router: Record<'push' | 'replace' | 'back', jest.Mock> };
const svc = require('@/services/family.service') as Record<string, jest.Mock<(...a: any[]) => Promise<any>>>;

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const mount = () => render(<SafeAreaProvider initialMetrics={metrics}><LanguageProvider><FamilyHubScreen /></LanguageProvider></SafeAreaProvider>);
const fail = (code: string, status = 400) => Object.assign(new Error(code), { response: { status, data: { statusCode: status, code, message: 'x' } } });

const member = (clientId: string, name: string, role: string, isYou = false) => ({ clientId, name, role, nickname: null, profileImage: null, joinedAt: '2030-01-01T00:00:00.000Z', isYou });
const MEMBERS = (me: string) => [member('aline', 'Aline Uwase', 'OWNER', me === 'aline'), member('eric', 'Eric Uwase', 'ADMIN', me === 'eric'), member('grace', 'Grace Uwase', 'MEMBER', me === 'grace'), member('kevin', 'Kevin Uwase', 'VIEWER', me === 'kevin')];
const INVITE = { id: 'i1', code: 'K7M2QX', role: 'MEMBER', phone: null, email: null, invitedBy: 'aline', createdAt: '2030-01-01T00:00:00.000Z', expiresAt: new Date(Date.now() + 3 * 86400000).toISOString() };
const ACT = [
  { id: 'a1', action: 'member.joined', createdAt: '2030-01-02T10:00:00.000Z', meta: null, actor: { clientId: 'grace', name: 'Grace Uwase' }, target: null },
  { id: 'a2', action: 'member.role_changed', createdAt: '2030-01-01T10:00:00.000Z', meta: { from: 'MEMBER', to: 'ADMIN' }, actor: { clientId: 'aline', name: 'Aline Uwase' }, target: { clientId: 'eric', name: 'Eric Uwase' } },
];

function setScope(role: string | null, over: Record<string, unknown> = {}) {
  mockScope.value = {
    ready: true, isFamily: true, scope: 'family', role, memberCount: 4, limits: { maxMembers: 12, maxPendingInvites: 20, inviteDays: 7 },
    family: role ? { id: 'fam-12345678', name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' } : null,
    refresh: jest.fn(async () => null), switchTo: jest.fn(async () => {}), can: () => true, ...over,
  };
}
/** Press a button of the most recent Alert by its label. */
const pressAlert = (label: string) => {
  const call = (Alert.alert as unknown as jest.Mock).mock.calls.at(-1) as any[];
  const btn = (call[2] as Array<{ text: string; onPress?: () => void | Promise<void> }>).find(b => b.text === label);
  return act(async () => { await btn!.onPress!(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  for (const m of Object.values(svc)) m.mockResolvedValue({ success: true });
  svc.getMembers.mockResolvedValue(MEMBERS('grace'));
  svc.getActivity.mockResolvedValue(ACT);
  svc.getInvites.mockResolvedValue([INVITE]);
  setScope('MEMBER');
});
afterEach(cleanup);

describe('without a family', () => {
  test('explains, and offers Create and Join', async () => {
    setScope(null, { isFamily: false });
    await mount();
    expect(screen.getByTestId('family-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('family-hub-create'));
    expect(router.push).toHaveBeenCalledWith('/(dashboard)/family-create');
    await fireEvent.press(screen.getByTestId('family-hub-join'));
    expect(router.push).toHaveBeenCalledWith('/(dashboard)/family-join');
    expect(svc.getMembers).not.toHaveBeenCalled();
  });
});

describe('what each role sees', () => {
  test('the Owner: members, invite, pending invites, activity and every owner action; no Leave', async () => {
    setScope('OWNER');
    svc.getMembers.mockResolvedValue(MEMBERS('aline'));
    await mount();
    expect(await screen.findByText('Aline Uwase (you)')).toBeTruthy();
    expect(screen.getByText('Eric Uwase')).toBeTruthy();
    expect(screen.getByText('4 of 12 members · RWF')).toBeTruthy();
    expect(screen.getByTestId('family-role-line').props.children).toBe('You are Owner');
    expect(screen.getByTestId('family-invite')).toBeTruthy();
    expect(screen.getByText('K7M2QX')).toBeTruthy();
    expect(screen.getByText('Grace Uwase joined')).toBeTruthy();
    expect(screen.getByText('Aline Uwase made Eric Uwase Admin')).toBeTruthy();
    for (const id of ['family-edit', 'family-transfer', 'family-delete']) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.queryByTestId('family-leave')).toBeNull();
  });
  test('an Admin: can invite and sees the pending list, but has no owner actions and can leave', async () => {
    setScope('ADMIN');
    svc.getMembers.mockResolvedValue(MEMBERS('eric'));
    await mount();
    await screen.findByText('Eric Uwase (you)');
    expect(screen.getByTestId('family-invite')).toBeTruthy();
    expect(screen.getByTestId('invite-i1')).toBeTruthy();
    expect(screen.queryByTestId('family-delete')).toBeNull();
    expect(screen.queryByTestId('family-transfer')).toBeNull();
    expect(screen.getByTestId('family-leave')).toBeTruthy();
  });
  test.each(['MEMBER', 'VIEWER'])('a %s: no invite button (a note instead), no pending list, can leave', async role => {
    setScope(role);
    svc.getMembers.mockResolvedValue(MEMBERS(role === 'MEMBER' ? 'grace' : 'kevin'));
    await mount();
    await screen.findByText(/\(you\)/);
    expect(screen.queryByTestId('family-invite')).toBeNull();
    expect(screen.getByTestId('family-invite-note')).toBeTruthy();
    expect(screen.queryByTestId('invite-i1')).toBeNull();
    expect(svc.getInvites).not.toHaveBeenCalled();                      // not even asked for
    expect(screen.getByTestId('family-leave')).toBeTruthy();
    expect(screen.queryByTestId('family-edit')).toBeNull();
  });
  test('when you are in Personal, the family can be opened from here', async () => {
    setScope('MEMBER', { isFamily: false, scope: 'personal' });
    await mount();
    await fireEvent.press(await screen.findByTestId('family-open'));
    expect(mockScope.value.switchTo).toHaveBeenCalledWith('family');
    expect(router.replace).toHaveBeenCalledWith('/(dashboard)');
  });
  test('a load error is shown in words', async () => {
    svc.getMembers.mockRejectedValue(fail('NOT_A_MEMBER', 403));
    await mount();
    expect(await screen.findByText('You are no longer a member of that family.')).toBeTruthy();
  });
});

describe('leaving', () => {
  test('asks first, leaves, goes back to Personal before refreshing (so no "you were removed" notice), then Home', async () => {
    const order: string[] = [];
    svc.removeMember.mockImplementation(async () => { order.push('remove'); return { success: true }; });
    setScope('MEMBER', { switchTo: jest.fn(async () => { order.push('switch'); }), refresh: jest.fn(async () => { order.push('refresh'); return null; }) });
    await mount();
    await fireEvent.press(await screen.findByTestId('family-leave'));
    order.length = 0;                                                    // the screen refreshes once when it opens; only what follows matters
    expect((Alert.alert as unknown as jest.Mock).mock.calls.at(-1)![0]).toBe('Leave Mwiza Family?');
    expect(svc.removeMember).not.toHaveBeenCalled();
    await pressAlert('Leave family');
    expect(svc.removeMember).toHaveBeenCalledWith('fam-12345678', 'grace');
    expect(order).toEqual(['remove', 'switch', 'refresh']);
    expect(router.replace).toHaveBeenCalledWith('/(dashboard)');
  });
  test('cancelling leaves nothing changed', async () => {
    await mount();
    await fireEvent.press(await screen.findByTestId('family-leave'));
    expect(svc.removeMember).not.toHaveBeenCalled();
  });
  test('a refusal is shown and nothing else happens', async () => {
    svc.removeMember.mockRejectedValue(fail('OWNER_MUST_TRANSFER', 409));
    await mount();
    await fireEvent.press(await screen.findByTestId('family-leave'));
    await pressAlert('Leave family');
    expect(await screen.findByText(/The owner cannot leave/)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('invites', () => {
  beforeEach(() => { setScope('OWNER'); svc.getMembers.mockResolvedValue(MEMBERS('aline')); });
  test('one invite is revoked and the list reloads', async () => {
    await mount();
    await fireEvent.press(await screen.findByTestId('revoke-i1'));
    expect(svc.revokeInvite).toHaveBeenCalledWith('fam-12345678', 'i1');
    await waitFor(() => expect(svc.getInvites.mock.calls.length).toBeGreaterThan(1));
  });
  test('"Revoke all" appears with two or more, and asks first', async () => {
    svc.getInvites.mockResolvedValue([INVITE, { ...INVITE, id: 'i2', code: 'AB23CD' }]);
    await mount();
    await fireEvent.press(await screen.findByTestId('family-revoke-all'));
    expect(svc.revokeAllInvites).not.toHaveBeenCalled();
    await pressAlert('Revoke all');
    expect(svc.revokeAllInvites).toHaveBeenCalledWith('fam-12345678');
  });
  test('"Revoke all" is not offered for a single invite', async () => {
    await mount();
    await screen.findByTestId('invite-i1');
    expect(screen.queryByTestId('family-revoke-all')).toBeNull();
  });
  test('the invite button opens the invite sheet', async () => {
    await mount();
    await fireEvent.press(await screen.findByTestId('family-invite'));
    expect(screen.getByText('Choose what they can do.')).toBeTruthy();
  });
});

describe('the owner\'s actions', () => {
  beforeEach(() => { setScope('OWNER'); svc.getMembers.mockResolvedValue(MEMBERS('aline')); });

  test('transfer: pick someone, confirm, done; the family is refreshed', async () => {
    await mount();
    await fireEvent.press(await screen.findByTestId('family-transfer'));
    expect(screen.queryByTestId('transfer-aline')).toBeNull();          // not yourself
    await fireEvent.press(screen.getByTestId('transfer-grace'));
    expect((Alert.alert as unknown as jest.Mock).mock.calls.at(-1)![0]).toBe('Make Grace Uwase the owner?');
    expect(svc.transferOwnership).not.toHaveBeenCalled();
    await pressAlert('Transfer');
    expect(svc.transferOwnership).toHaveBeenCalledWith('fam-12345678', 'grace');
    await waitFor(() => expect(mockScope.value.refresh).toHaveBeenCalled());
  });
  test('delete: the button waits for the name, then deletes and returns to Personal', async () => {
    const order: string[] = [];
    svc.deleteFamily.mockImplementation(async () => { order.push('delete'); return { success: true }; });
    setScope('OWNER', { switchTo: jest.fn(async () => { order.push('switch'); }), refresh: jest.fn(async () => { order.push('refresh'); return null; }) });
    await mount();
    await fireEvent.press(await screen.findByTestId('family-delete'));
    order.length = 0;
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    expect(svc.deleteFamily).not.toHaveBeenCalled();                    // disabled until the name matches
    await fireEvent.changeText(screen.getByTestId('delete-name'), 'wrong');
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    expect(svc.deleteFamily).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('delete-name'), ' mwiza family ');
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(dashboard)'));
    expect(svc.deleteFamily).toHaveBeenCalledWith('fam-12345678', 'mwiza family');
    expect(order.slice(0, 2)).toEqual(['delete', 'switch']);
  });
  test('edit: a new name and currency are saved, and a currency change is explained', async () => {
    svc.updateFamily.mockResolvedValue({ family: {}, currencyChanged: true, amountsUnchanged: true });
    await mount();
    await fireEvent.press(await screen.findByTestId('family-edit'));
    await fireEvent.changeText(screen.getByTestId('edit-name'), 'Mwiza & Co');
    await fireEvent.press(screen.getByTestId('edit-currency-USD'));
    await fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(svc.updateFamily).toHaveBeenCalledWith('fam-12345678', { name: 'Mwiza & Co', currency: 'USD' }));
    expect((Alert.alert as unknown as jest.Mock).mock.calls.at(-1)![0]).toBe('Currency changed');
  });
  test('edit: a refusal shows its sentence', async () => {
    svc.updateFamily.mockRejectedValue(fail('FORBIDDEN_ACTION', 403));
    await mount();
    await fireEvent.press(await screen.findByTestId('family-edit'));
    await fireEvent.press(screen.getByTestId('edit-save'));
    expect(await screen.findByText('Your role does not allow this.')).toBeTruthy();
  });
});

describe('a member row', () => {
  test('opens the member sheet', async () => {
    setScope('OWNER');
    svc.getMembers.mockResolvedValue(MEMBERS('aline'));
    await mount();
    await fireEvent.press(await screen.findByTestId('member-grace'));
    expect(screen.getByTestId('member-role-ADMIN')).toBeTruthy();
    expect(screen.getByTestId('member-remove')).toBeTruthy();
  });
});
