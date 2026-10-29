import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), navigate: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)', buttonBg: '#00627F', headerBg: '#00627F',
    text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9', border: 'rgba(0,98,127,0.12)', inputBg: '#F3F8FA', isDark: false,
  }),
}));
jest.mock('@/services/family.service', () => ({ createFamily: jest.fn(), previewInvite: jest.fn(), joinFamily: jest.fn() }));
jest.mock('@/services/wallet.service', () => ({ createWallet: jest.fn() }));
jest.mock('@/services/client-auth.service', () => ({ getToken: jest.fn(async () => 'token') }));
const mockScope = { refresh: jest.fn(async () => null), switchTo: jest.fn(async () => {}) };
jest.mock('@/context/scope-context', () => ({ useScope: () => mockScope }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import FamilyCreateScreen from '@/app/(dashboard)/family-create';
import FamilyJoinScreen from '@/app/(dashboard)/family-join';
import { loadPendingInvite, savePendingInvite } from '@/utils/pending-invite';

const { router, useLocalSearchParams } = require('expo-router') as { router: Record<'push' | 'replace' | 'back' | 'canGoBack', jest.Mock>; useLocalSearchParams: jest.Mock };
const svc = require('@/services/family.service') as Record<'createFamily' | 'previewInvite' | 'joinFamily', jest.Mock<(...a: any[]) => Promise<any>>>;
const wallets = require('@/services/wallet.service') as { createWallet: jest.Mock<(...a: any[]) => Promise<any>> };
const auth = require('@/services/client-auth.service') as { getToken: jest.Mock<() => Promise<string | null>> };

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}><LanguageProvider>{ui}</LanguageProvider></SafeAreaProvider>);
const fail = (code: string, status = 400) => Object.assign(new Error(code), { response: { status, data: { statusCode: status, code, message: 'x' } } });
const preview = { family: { id: 'f1', name: 'Mwiza Family' }, invitedBy: 'Aline Uwase', role: 'MEMBER', expiresAt: '2030-01-08T00:00:00Z' };

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  auth.getToken.mockResolvedValue('token');
  useLocalSearchParams.mockReturnValue({});
  svc.createFamily.mockResolvedValue({ family: { id: 'f1', name: 'Mwiza Family' }, role: 'OWNER' });
  svc.previewInvite.mockResolvedValue(preview);
  svc.joinFamily.mockResolvedValue({ family: { id: 'f1', name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' }, role: 'MEMBER' });
  wallets.createWallet.mockResolvedValue({ id: 'w1' });
});
afterEach(cleanup);

describe('Create a family', () => {
  test('a name is needed', async () => {
    await wrap(<FamilyCreateScreen />);
    await fireEvent.press(screen.getByTestId('family-create-submit'));
    expect(screen.getByTestId('family-error')).toBeTruthy();
    expect(svc.createFamily).not.toHaveBeenCalled();
  });

  test('creates the family, moves into it, adds the first wallet, and goes Home', async () => {
    const order: string[] = [];
    svc.createFamily.mockImplementation(async () => { order.push('create'); return { family: { id: 'f1' }, role: 'OWNER' }; });
    mockScope.refresh.mockImplementation(async () => { order.push('refresh'); return null; });
    mockScope.switchTo.mockImplementation(async () => { order.push('switch'); });
    wallets.createWallet.mockImplementation(async () => { order.push('wallet'); return { id: 'w1' }; });
    await wrap(<FamilyCreateScreen />);
    await fireEvent.changeText(screen.getByTestId('family-name'), '  Mwiza Family ');
    await fireEvent.press(screen.getByTestId('family-currency-USD'));
    await fireEvent.changeText(screen.getByTestId('family-wallet'), 'Household');
    await fireEvent.press(screen.getByTestId('family-create-submit'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(dashboard)'));
    expect(svc.createFamily).toHaveBeenCalledWith({ name: 'Mwiza Family', currency: 'USD', timezone: expect.any(String) });
    expect(order).toEqual(['create', 'refresh', 'switch', 'wallet']);          // the wallet is made while standing in the family
    expect(wallets.createWallet).toHaveBeenCalledWith(expect.objectContaining({ name: 'Household', currency: 'USD', balance: 0 }));
  });

  test('no wallet name means no wallet is made', async () => {
    await wrap(<FamilyCreateScreen />);
    await fireEvent.changeText(screen.getByTestId('family-name'), 'Mwiza');
    await fireEvent.press(screen.getByTestId('family-create-submit'));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(wallets.createWallet).not.toHaveBeenCalled();
  });

  test('a wallet that fails to save does not undo the family', async () => {
    wallets.createWallet.mockRejectedValue(new Error('boom'));
    await wrap(<FamilyCreateScreen />);
    await fireEvent.changeText(screen.getByTestId('family-name'), 'Mwiza');
    await fireEvent.changeText(screen.getByTestId('family-wallet'), 'Household');
    await fireEvent.press(screen.getByTestId('family-create-submit'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(dashboard)'));
  });

  test('an unverified account is sent to verify, with a button', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    svc.createFamily.mockRejectedValue(fail('NOT_VERIFIED', 403));
    await wrap(<FamilyCreateScreen />);
    await fireEvent.changeText(screen.getByTestId('family-name'), 'Mwiza');
    await fireEvent.press(screen.getByTestId('family-create-submit'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][0]).toBe('Verify your account first');
    const buttons = alert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    buttons.find(b => b.text === 'Verify now')!.onPress!();
    expect(router.push).toHaveBeenCalledWith('/(dashboard)/(settings)/verify');
    expect(router.replace).not.toHaveBeenCalled();
  });

  test('already being in a family shows its own sentence and stays on the screen', async () => {
    svc.createFamily.mockRejectedValue(fail('ALREADY_IN_FAMILY', 409));
    await wrap(<FamilyCreateScreen />);
    await fireEvent.changeText(screen.getByTestId('family-name'), 'Mwiza');
    await fireEvent.press(screen.getByTestId('family-create-submit'));
    expect(await screen.findByText('You are already in a family. Leave it first.')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  test('a lost connection says so', async () => {
    svc.createFamily.mockRejectedValue(new Error('Network Error'));
    await wrap(<FamilyCreateScreen />);
    await fireEvent.changeText(screen.getByTestId('family-name'), 'Mwiza');
    await fireEvent.press(screen.getByTestId('family-create-submit'));
    expect(await screen.findByText('No connection. Check your internet and try again.')).toBeTruthy();
  });

  test('the back button goes back', async () => {
    await wrap(<FamilyCreateScreen />);
    await fireEvent.press(screen.getByTestId('family-back'));
    expect(router.back).toHaveBeenCalled();
  });
});

describe('Join a family', () => {
  test('a code is previewed (who, which role, the privacy notice) and then joined', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await wrap(<FamilyJoinScreen />);
    await fireEvent.changeText(screen.getByTestId('family-join-input'), 'k7m 2qx');
    await fireEvent.press(screen.getByTestId('family-join-continue'));
    expect(await screen.findByTestId('family-join-preview')).toBeTruthy();
    expect(svc.previewInvite).toHaveBeenCalledWith({ code: 'K7M2QX' });
    expect(screen.getByText('Mwiza Family')).toBeTruthy();
    expect(screen.getByText('Invited by Aline Uwase')).toBeTruthy();
    expect(screen.getByText('You would join as Member')).toBeTruthy();
    expect(screen.getByText(/They can never see your personal money/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('family-join-confirm'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(dashboard)'));
    expect(svc.joinFamily).toHaveBeenCalledWith({ code: 'K7M2QX' });
    expect(mockScope.refresh).toHaveBeenCalled();
    expect(mockScope.switchTo).toHaveBeenCalledWith('family');
    expect(alert).toHaveBeenCalledWith('Welcome', 'You joined Mwiza Family.');
  });

  test('a pasted link works too', async () => {
    await wrap(<FamilyJoinScreen />);
    const token = 'abcDEF123_-abcDEF123_-abcd';
    await fireEvent.changeText(screen.getByTestId('family-join-input'), `https://aby-expense.onrender.com/join/${token}`);
    await fireEvent.press(screen.getByTestId('family-join-continue'));
    await screen.findByTestId('family-join-preview');
    expect(svc.previewInvite).toHaveBeenCalledWith({ token });
  });

  test('something that is not an invite is refused before it reaches the server', async () => {
    await wrap(<FamilyJoinScreen />);
    await fireEvent.changeText(screen.getByTestId('family-join-input'), 'hello');
    await fireEvent.press(screen.getByTestId('family-join-continue'));
    expect(screen.getByTestId('family-join-error')).toBeTruthy();
    expect(svc.previewInvite).not.toHaveBeenCalled();
  });

  test.each([
    ['INVITE_NOT_FOUND', 'No invite matches that code.'], ['INVITE_EXPIRED', 'This invite expired. Ask for a new one.'],
    ['INVITE_INVALID', 'This invite is no longer valid.'], ['INVITE_FOR_SOMEONE_ELSE', 'This invite was sent to someone else.'],
    ['FAMILY_FULL', 'This family has reached its member limit.'], ['FAMILY_GONE', 'This family no longer exists.'],
    ['NOT_VERIFIED', 'Verify your email or phone first.'], ['TOO_MANY_ATTEMPTS', 'Too many wrong codes. Try again in a few minutes.'],
  ])('a preview that answers %s shows its sentence', async (code, sentence) => {
    svc.previewInvite.mockRejectedValue(fail(code, 410));
    await wrap(<FamilyJoinScreen />);
    await fireEvent.changeText(screen.getByTestId('family-join-input'), 'K7M2QX');
    await fireEvent.press(screen.getByTestId('family-join-continue'));
    expect(await screen.findByText(sentence)).toBeTruthy();
    expect(screen.queryByTestId('family-join-preview')).toBeNull();
  });

  test('already being in a family offers a way to open it', async () => {
    svc.previewInvite.mockRejectedValue(fail('ALREADY_IN_FAMILY', 409));
    await wrap(<FamilyJoinScreen />);
    await fireEvent.changeText(screen.getByTestId('family-join-input'), 'K7M2QX');
    await fireEvent.press(screen.getByTestId('family-join-continue'));
    await fireEvent.press(await screen.findByTestId('family-join-open'));
    expect(router.replace).toHaveBeenCalledWith('/(dashboard)/family');
  });

  test('an invite that stops working between the preview and the join says so and goes back to the code box', async () => {
    svc.joinFamily.mockRejectedValue(fail('INVITE_INVALID', 410));
    await wrap(<FamilyJoinScreen />);
    await fireEvent.changeText(screen.getByTestId('family-join-input'), 'K7M2QX');
    await fireEvent.press(screen.getByTestId('family-join-continue'));
    await fireEvent.press(await screen.findByTestId('family-join-confirm'));
    expect(await screen.findByText('This invite is no longer valid.')).toBeTruthy();
    expect(screen.queryByTestId('family-join-preview')).toBeNull();
    expect(router.replace).not.toHaveBeenCalledWith('/(dashboard)');
  });

  test('"use another code" returns to the box', async () => {
    await wrap(<FamilyJoinScreen />);
    await fireEvent.changeText(screen.getByTestId('family-join-input'), 'K7M2QX');
    await fireEvent.press(screen.getByTestId('family-join-continue'));
    await fireEvent.press(await screen.findByTestId('family-join-cancel'));
    expect(screen.getByTestId('family-join-input')).toBeTruthy();
  });
});

describe('opening the Join screen from an invite link', () => {
  test('signed in: the invite in the address is previewed straight away', async () => {
    useLocalSearchParams.mockReturnValue({ token: 'abcDEF123_-abcDEF123_-abcd' });
    await wrap(<FamilyJoinScreen />);
    await screen.findByTestId('family-join-preview');
    expect(svc.previewInvite).toHaveBeenCalledWith({ token: 'abcDEF123_-abcDEF123_-abcd' });
  });
  test('a code in the address fills the box and previews', async () => {
    useLocalSearchParams.mockReturnValue({ code: 'K7M2QX' });
    await wrap(<FamilyJoinScreen />);
    await screen.findByTestId('family-join-preview');
    expect(svc.previewInvite).toHaveBeenCalledWith({ code: 'K7M2QX' });
  });
  test('signed out: the invite is kept and the person is sent to sign in', async () => {
    auth.getToken.mockResolvedValue(null);
    useLocalSearchParams.mockReturnValue({ code: 'K7M2QX' });
    await wrap(<FamilyJoinScreen />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(auth)/login'));
    expect(await loadPendingInvite()).toEqual({ code: 'K7M2QX' });
    expect(svc.previewInvite).not.toHaveBeenCalled();
  });
  test('after signing in, a kept invite is previewed and then forgotten once used', async () => {
    await savePendingInvite({ code: 'K7M2QX' });
    await wrap(<FamilyJoinScreen />);
    await screen.findByTestId('family-join-preview');
    expect(svc.previewInvite).toHaveBeenCalledWith({ code: 'K7M2QX' });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await fireEvent.press(screen.getByTestId('family-join-confirm'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(dashboard)'));
    expect(await loadPendingInvite()).toBeNull();
  });
  test('a kept invite that turns out to be dead is forgotten', async () => {
    await savePendingInvite({ code: 'K7M2QX' });
    svc.previewInvite.mockRejectedValue(fail('INVITE_EXPIRED', 410));
    await wrap(<FamilyJoinScreen />);
    expect(await screen.findByText('This invite expired. Ask for a new one.')).toBeTruthy();
    expect(await loadPendingInvite()).toBeNull();
  });
  test('nothing in the address and nothing kept: just the empty box', async () => {
    await wrap(<FamilyJoinScreen />);
    await act(async () => {});
    expect(svc.previewInvite).not.toHaveBeenCalled();
    expect(screen.getByTestId('family-join-input').props.value).toBe('');
  });
});
