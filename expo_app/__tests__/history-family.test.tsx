import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import HistoryScreen from '@/app/(dashboard)/history';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams.current,
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@/components/fade-in-view', () => ({ FadeInView: ({ children }: any) => children }));
jest.mock('@/services/transaction.service', () => ({ getTransactionHistory: jest.fn(), deleteTransaction: jest.fn(), CATEGORY_ICON: {} }));
jest.mock('@/services/family.service', () => ({ getMembers: jest.fn() }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#5B3FD0', primaryBg: 'rgba(91,63,208,0.1)',
    buttonBg: '#5B3FD0', headerBg: '#5B3FD0', text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9',
    border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));
const mockScope: { value: any } = { value: {} };
jest.mock('@/context/scope-context', () => ({ useScope: () => mockScope.value }));

type Fn = jest.Mock<(...a: any[]) => Promise<any>>;
const txSvc = require('@/services/transaction.service') as { getTransactionHistory: Fn; deleteTransaction: Fn };
const famSvc = require('@/services/family.service') as { getMembers: Fn };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const family = { id: 'fam-12345678', name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' };
const MAY: Record<string, (a: string) => boolean> = {
  OWNER: () => true, ADMIN: () => true, MEMBER: a => a === 'tx.add' || a === 'tx.edit.own', VIEWER: () => false,
};
const inFamily = (role: string) => ({ ready: true, isFamily: true, scope: 'family', family, role, switchTo: jest.fn(), can: MAY[role] });
const personal = () => ({ ready: true, isFamily: false, scope: 'personal', family: null, role: null, switchTo: jest.fn(), can: () => true });

const row = (id: string, title: string, who: { clientId: string; name: string; isYou: boolean } | null) =>
  ({ id, type: 'EXPENSE', category: 'food', title, subCategory: null, description: null, amount: -1000, date: '2030-10-20T10:00:00Z', walletId: 'fw1', receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null, ...(who ? { author: who } : {}) });
const GRACE = { clientId: 'grace', name: 'Grace Uwase', isYou: false };
const ME = { clientId: 'aline', name: 'Aline Uwase', isYou: true };
const MEMBERS = [
  { clientId: 'aline', name: 'Aline Uwase', role: 'OWNER', nickname: null, profileImage: null, joinedAt: '2030-01-01T00:00:00Z', isYou: true },
  { clientId: 'grace', name: 'Grace Uwase', role: 'MEMBER', nickname: null, profileImage: null, joinedAt: '2030-01-01T00:00:00Z', isYou: false },
];

async function mount() {
  await render(<SafeAreaProvider initialMetrics={metrics}><LanguageProvider><HistoryScreen /></LanguageProvider></SafeAreaProvider>);
}
const lastQuery = () => txSvc.getTransactionHistory.mock.calls.at(-1)![0] as Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.current = {};
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockScope.value = inFamily('MEMBER');
  famSvc.getMembers.mockResolvedValue(MEMBERS);
  txSvc.getTransactionHistory.mockResolvedValue([{ date: 'TODAY', items: [row('t1', 'Groceries', GRACE), row('t2', 'Fuel', ME)] }]);
  txSvc.deleteTransaction.mockResolvedValue({ success: true });
});
afterEach(cleanup);

describe('History inside a family', () => {
  test('every row says who added it, "you" for your own', async () => {
    await mount();
    expect(await screen.findByText(/food · .* · Grace Uwase/)).toBeTruthy();
    expect(screen.getByText(/food · .* · you/)).toBeTruthy();
  });

  test('only All, Income and Expense chips are offered', async () => {
    await mount();
    await screen.findByText('Groceries');
    expect(screen.getByText('Expense')).toBeTruthy();
    for (const hidden of ['Loan', 'Debt', 'Scheduled']) expect(screen.queryByText(hidden)).toBeNull();
  });

  test('a member filter appears, and choosing someone asks the server for just their entries', async () => {
    await mount();
    await screen.findByTestId('member-filter');
    expect(screen.getByTestId('member-filter-everyone')).toBeTruthy();
    expect(lastQuery().memberId).toBeUndefined();
    await fireEvent.press(screen.getByTestId('member-filter-grace'));
    await waitFor(() => expect(lastQuery().memberId).toBe('grace'));
    await fireEvent.press(screen.getByTestId('member-filter-everyone'));
    await waitFor(() => expect(lastQuery().memberId).toBeUndefined());
  });

  test('a Member can delete their own entry, not somebody else\'s', async () => {
    await mount();
    await fireEvent(await screen.findByText('Fuel'), 'longPress');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    (Alert.alert as unknown as jest.Mock).mockClear();
    await fireEvent(screen.getByText('Groceries'), 'longPress');
    expect(Alert.alert).not.toHaveBeenCalled();
  });
  test('an Admin or the Owner can delete anyone\'s', async () => {
    mockScope.value = inFamily('ADMIN');
    await mount();
    await fireEvent(await screen.findByText('Groceries'), 'longPress');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });
  test('a Viewer can delete nothing', async () => {
    mockScope.value = inFamily('VIEWER');
    await mount();
    await fireEvent(await screen.findByText('Fuel'), 'longPress');
    expect(Alert.alert).not.toHaveBeenCalled();
  });
  test('a refused delete shows the reason in words', async () => {
    mockScope.value = inFamily('ADMIN');
    txSvc.deleteTransaction.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 403, data: { code: 'FORBIDDEN_ACTION' } } }));
    await mount();
    await fireEvent(await screen.findByText('Groceries'), 'longPress');
    const buttons = (Alert.alert as unknown as jest.Mock).mock.calls.at(-1)![2] as Array<{ text: string; onPress?: () => Promise<void> }>;
    await buttons.find(b => b.text === 'Delete')!.onPress!();
    await waitFor(() => expect((Alert.alert as unknown as jest.Mock).mock.calls.at(-1)![1]).toBe('Your role does not allow this.'));
  });
});

describe('History in Personal (unchanged)', () => {
  beforeEach(() => {
    mockScope.value = personal();
    txSvc.getTransactionHistory.mockResolvedValue([{ date: 'TODAY', items: [row('t1', 'Groceries', null)] }]);
  });
  test('no member filter, every chip, no author, and a long-press deletes', async () => {
    await mount();
    await screen.findByText('Groceries');
    expect(screen.queryByTestId('member-filter')).toBeNull();
    expect(famSvc.getMembers).not.toHaveBeenCalled();
    expect(screen.getByText('Scheduled')).toBeTruthy();
    expect(screen.queryByText(/ · you$/)).toBeNull();
    await fireEvent(screen.getByText('Groceries'), 'longPress');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });
});
