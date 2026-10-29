import React from 'react';
import { Alert, Share } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', surface: '#FFFFFF', primary: '#5B3FD0', primaryBg: 'rgba(91,63,208,0.1)', buttonBg: '#5B3FD0', headerBg: '#5B3FD0',
    text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9', border: 'rgba(0,98,127,0.12)', inputBg: '#F3F8FA', isDark: false,
  }),
}));
jest.mock('@/services/family.service', () => ({ createInvite: jest.fn(), removeMember: jest.fn(), setMemberRole: jest.fn() }));

import { InviteSheet } from '@/components/family/invite-sheet';
import { MemberSheet } from '@/components/family/member-sheet';
import type { FamilyMemberRow } from '@/services/family.service';
import type { FamilyRole } from '@/utils/family-permissions';

const Clipboard = require('expo-clipboard') as { setStringAsync: jest.Mock };
const svc = require('@/services/family.service') as Record<'createInvite' | 'removeMember' | 'setMemberRole', jest.Mock<(...a: any[]) => Promise<any>>>;
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}><LanguageProvider>{ui}</LanguageProvider></SafeAreaProvider>);
const fail = (code: string, status = 400) => Object.assign(new Error(code), { response: { status, data: { statusCode: status, code, message: 'x' } } });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  svc.createInvite.mockResolvedValue({ id: 'i1', code: 'K7M2QX', token: 'tok', link: 'https://x/join/tok', role: 'MEMBER', expiresAt: '2030-01-08T00:00:00Z', phone: null, email: null });
  svc.removeMember.mockResolvedValue({ success: true });
  svc.setMemberRole.mockResolvedValue({ clientId: 'grace', role: 'ADMIN' });
});
afterEach(cleanup);

const sheet = (actorRole: FamilyRole, over: Record<string, unknown> = {}) =>
  <InviteSheet visible onClose={jest.fn()} familyId="fam-12345678" familyName="Mwiza Family" actorRole={actorRole} inviteDays={7} {...over} />;

describe('the invite sheet', () => {
  test('the Owner may offer Member, Viewer and Admin', async () => {
    await wrap(sheet('OWNER'));
    await fireEvent.press(screen.getByTestId('invite-role-ADMIN'));
    await fireEvent.press(screen.getByTestId('invite-create'));
    await waitFor(() => expect(svc.createInvite).toHaveBeenCalledWith('fam-12345678', { role: 'ADMIN' }));
  });
  test('an Admin cannot offer Admin: it is marked owner-only and pressing it does nothing', async () => {
    await wrap(sheet('ADMIN'));
    expect(screen.getByText('Admin · owner only')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('invite-role-ADMIN'));
    await fireEvent.press(screen.getByTestId('invite-create'));
    await waitFor(() => expect(svc.createInvite).toHaveBeenCalledWith('fam-12345678', { role: 'MEMBER' }));      // stayed on the default
  });
  test('the default is Member, and Viewer can be chosen', async () => {
    await wrap(sheet('OWNER'));
    await fireEvent.press(screen.getByTestId('invite-role-VIEWER'));
    await fireEvent.press(screen.getByTestId('invite-create'));
    await waitFor(() => expect(svc.createInvite).toHaveBeenCalledWith('fam-12345678', { role: 'VIEWER' }));
  });
  test('after creating: the code is shown large, with how long it works', async () => {
    const created = jest.fn();
    await wrap(sheet('OWNER', { onCreated: created }));
    await fireEvent.press(screen.getByTestId('invite-create'));
    expect(await screen.findByTestId('invite-code')).toHaveTextContent('K7M2QX');
    expect(screen.getByText('Works once, for 7 days.')).toBeTruthy();
    expect(screen.getByText('They will join as Member')).toBeTruthy();
    expect(created).toHaveBeenCalledTimes(1);
  });
  test('sharing sends the family, the code and how to use it (no link until the web page exists)', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
    await wrap(sheet('OWNER'));
    await fireEvent.press(screen.getByTestId('invite-create'));
    await fireEvent.press(await screen.findByTestId('invite-share'));
    const message = (share.mock.calls[0][0] as { message: string }).message;
    expect(message).toContain('Mwiza Family');
    expect(message).toContain('Your code: K7M2QX');
    expect(message).toContain('Join with a code');
    expect(message).not.toContain('https://x/join/tok');
  });
  test('a closed share sheet is not an error', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('dismissed'));
    await wrap(sheet('OWNER'));
    await fireEvent.press(screen.getByTestId('invite-create'));
    await fireEvent.press(await screen.findByTestId('invite-share'));
    expect(screen.getByTestId('invite-code')).toBeTruthy();
  });
  test('copying puts the code on the clipboard and says so', async () => {
    await wrap(sheet('OWNER'));
    await fireEvent.press(screen.getByTestId('invite-create'));
    await fireEvent.press(await screen.findByTestId('invite-copy'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('K7M2QX');
    expect(Alert.alert).toHaveBeenCalledWith('Code copied', 'K7M2QX');
  });
  test.each([['FAMILY_FULL', 'This family has reached its member limit.'], ['TOO_MANY_PENDING_INVITES', 'Too many invites are waiting. Revoke some first.'], ['FORBIDDEN_ACTION', 'Your role does not allow this.']])(
    'a refusal (%s) is shown and no code appears', async (code, sentence) => {
      svc.createInvite.mockRejectedValue(fail(code, 409));
      await wrap(sheet('OWNER'));
      await fireEvent.press(screen.getByTestId('invite-create'));
      expect(await screen.findByText(sentence)).toBeTruthy();
      expect(screen.queryByTestId('invite-code')).toBeNull();
    });
  test('Done closes the sheet', async () => {
    const onClose = jest.fn();
    await wrap(sheet('OWNER', { onClose }));
    await fireEvent.press(screen.getByTestId('invite-create'));
    await fireEvent.press(await screen.findByTestId('invite-done'));
    expect(onClose).toHaveBeenCalled();
  });
});

const row = (role: FamilyRole, over: Partial<FamilyMemberRow> = {}): FamilyMemberRow =>
  ({ clientId: 'grace', name: 'Grace Uwase', role, nickname: null, profileImage: null, joinedAt: '2030-01-01T00:00:00.000Z', isYou: false, ...over });
const member = (actorRole: FamilyRole, m: FamilyMemberRow, over: Record<string, unknown> = {}) =>
  <MemberSheet visible member={m} familyId="fam-12345678" actorRole={actorRole} onClose={jest.fn()} onChanged={jest.fn()} {...over} />;
const pressAlert = (label: string) => {
  const call = (Alert.alert as unknown as jest.Mock).mock.calls.at(-1) as any[];
  const btn = (call[2] as Array<{ text: string; onPress?: () => void | Promise<void> }>).find(b => b.text === label);
  return act(async () => { await btn!.onPress!(); });
};

describe('the member sheet', () => {
  test('the Owner looking at a Member: can change the role and remove', async () => {
    const onChanged = jest.fn(), onClose = jest.fn();
    await wrap(member('OWNER', row('MEMBER'), { onChanged, onClose }));
    for (const r of ['ADMIN', 'MEMBER', 'VIEWER']) expect(screen.getByTestId(`member-role-${r}`)).toBeTruthy();
    expect(screen.getByTestId('member-remove')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('member-role-ADMIN'));
    await waitFor(() => expect(svc.setMemberRole).toHaveBeenCalledWith('fam-12345678', 'grace', 'ADMIN'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });
  test('choosing the role they already have does nothing', async () => {
    await wrap(member('OWNER', row('MEMBER')));
    await fireEvent.press(screen.getByTestId('member-role-MEMBER'));
    expect(svc.setMemberRole).not.toHaveBeenCalled();
  });
  test('removing asks first, then removes', async () => {
    const onChanged = jest.fn();
    await wrap(member('OWNER', row('VIEWER'), { onChanged }));
    await fireEvent.press(screen.getByTestId('member-remove'));
    expect((Alert.alert as unknown as jest.Mock).mock.calls.at(-1)![0]).toBe('Remove Grace Uwase?');
    expect(svc.removeMember).not.toHaveBeenCalled();
    await pressAlert('Remove from family');
    expect(svc.removeMember).toHaveBeenCalledWith('fam-12345678', 'grace');
    expect(onChanged).toHaveBeenCalled();
  });
  test('an Admin looking at a Member: can remove, cannot change the role', async () => {
    await wrap(member('ADMIN', row('MEMBER')));
    expect(screen.getByTestId('member-remove')).toBeTruthy();
    expect(screen.queryByTestId('member-role-ADMIN')).toBeNull();
  });
  test('an Admin looking at another Admin, or the Owner: read only, with the reason', async () => {
    await wrap(member('ADMIN', row('ADMIN')));
    expect(screen.queryByTestId('member-remove')).toBeNull();
    expect(screen.getByTestId('member-reason')).toHaveTextContent('You can see this person but not change anything.');
    await cleanup();
    await wrap(member('ADMIN', row('OWNER')));
    expect(screen.getByTestId('member-reason')).toHaveTextContent('The owner\'s role cannot be changed here.');
    expect(screen.queryByTestId('member-remove')).toBeNull();
  });
  test('the Owner looking at themselves: nothing to change, and a pointer to Leave', async () => {
    await wrap(member('OWNER', row('OWNER', { isYou: true, clientId: 'aline', name: 'Aline Uwase' })));
    expect(screen.queryByTestId('member-remove')).toBeNull();
    expect(screen.queryByTestId('member-role-ADMIN')).toBeNull();
    expect(screen.getByTestId('member-reason')).toHaveTextContent('This is you. Use “Leave family” on the Family page.');
  });
  test.each(['MEMBER', 'VIEWER'] as FamilyRole[])('a %s looking at anyone: read only', async actor => {
    await wrap(member(actor, row('MEMBER')));
    expect(screen.queryByTestId('member-remove')).toBeNull();
    expect(screen.queryByTestId('member-role-ADMIN')).toBeNull();
    expect(screen.getByTestId('member-reason')).toBeTruthy();
  });
  test('shows what the role means', async () => {
    await wrap(member('OWNER', row('VIEWER')));
    expect(screen.getAllByText('Can only look (good for children)').length).toBeGreaterThan(0);      // at the top, and beside the role choices
  });
  test('a refusal is shown and the sheet stays open', async () => {
    svc.setMemberRole.mockRejectedValue(fail('OWNER_CANNOT_BE_CHANGED', 409));
    const onClose = jest.fn();
    await wrap(member('OWNER', row('MEMBER'), { onClose }));
    await fireEvent.press(screen.getByTestId('member-role-VIEWER'));
    expect(await screen.findByText('The owner cannot be changed this way.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
  test('no member means nothing is drawn', async () => {
    await wrap(<MemberSheet visible member={null} familyId="f" actorRole="OWNER" onClose={jest.fn()} onChanged={jest.fn()} />);
    expect(screen.queryByTestId('member-remove')).toBeNull();
  });
});
