import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import { PreferencesProvider } from '@/context/preferences-context';
import WalletDetailScreen from '@/app/(dashboard)/wallet-detail';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({ walletId: 'fw1' }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@/components/fade-in-view', () => ({ FadeInView: ({ children }: any) => children }));
jest.mock('@/services/wallet.service', () => ({
  getWallet: jest.fn(), getBalanceHistory: jest.fn(), getDailyFlow: jest.fn(), getActivity: jest.fn(), updateWallet: jest.fn(), deleteWallet: jest.fn(),
}));
jest.mock('@/services/transaction.service', () => ({ deleteTransaction: jest.fn(), CATEGORY_ICON: {} }));
jest.mock('@/components/wallet-form-modal', () => ({ WalletFormModal: () => null }));
jest.mock('@/components/transaction-detail-modal', () => ({ TransactionDetailModal: () => null }));
jest.mock('@/components/wallet/balance-chart', () => ({ BalanceChart: () => null }));
jest.mock('@/components/wallet/flow-chart', () => ({ FlowChart: () => null }));
jest.mock('@/components/wallet/wallet-hero-card', () => ({ WalletHeroCard: () => null, maskNumber: (n: string) => `••${n.slice(-4)}` }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', surface: '#FFFFFF', primary: '#5B3FD0', primaryBg: 'rgba(91,63,208,0.1)', buttonBg: '#5B3FD0', headerBg: '#5B3FD0',
    text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9', border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', isDark: false,
  }),
}));
const mockScope: { value: any } = { value: {} };
jest.mock('@/context/scope-context', () => ({ useScope: () => mockScope.value }));

type Fn = jest.Mock<(...a: any[]) => Promise<any>>;
const svc = require('@/services/wallet.service') as Record<'getWallet' | 'getBalanceHistory' | 'getDailyFlow' | 'getActivity' | 'updateWallet' | 'deleteWallet', Fn>;
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const mount = () => render(<SafeAreaProvider initialMetrics={metrics}><LanguageProvider><PreferencesProvider><WalletDetailScreen /></PreferencesProvider></LanguageProvider></SafeAreaProvider>);

const family = { id: 'fam-12345678', name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' };
const MATRIX: Record<string, Record<string, boolean>> = {
  OWNER: { 'wallet.manage': true, 'wallet.delete': true }, ADMIN: { 'wallet.manage': true, 'wallet.delete': false },
  MEMBER: { 'wallet.manage': false, 'wallet.delete': false }, VIEWER: { 'wallet.manage': false, 'wallet.delete': false },
};
const inFamily = (role: string) => ({ ready: true, isFamily: true, scope: 'family', family, role, switchTo: jest.fn(), can: (a: string) => !!MATRIX[role][a] });
const wallet = (over: Record<string, unknown> = {}) => ({ id: 'fw1', name: 'Household', bank: 'Cash', currency: 'RWF', balance: 10000, color: 'teal', walletType: 'CASH', last4: null, accountNumber: null, accountHolder: null, archived: false, isDefault: true, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  svc.getWallet.mockResolvedValue(wallet());
  svc.getBalanceHistory.mockResolvedValue({ currency: 'RWF', points: [] });
  svc.getDailyFlow.mockResolvedValue({ base: 'RWF', days: [], totalIn: 0, totalOut: 0 });
  svc.getActivity.mockResolvedValue([]);
});
afterEach(cleanup);

describe('Wallet detail', () => {
  test('in Personal: menu, archive and delete are all there', async () => {
    mockScope.value = { ready: true, isFamily: false, scope: 'personal', can: () => true };
    await mount();
    expect(await screen.findByTestId('wallet-archive')).toBeTruthy();
    expect(screen.getByTestId('wallet-delete')).toBeTruthy();
    expect(screen.getByTestId('wallet-menu').props.accessibilityState?.disabled).not.toBe(true);
  });
  test('in a family the Owner has archive and delete', async () => {
    mockScope.value = inFamily('OWNER');
    await mount();
    expect(await screen.findByTestId('wallet-archive')).toBeTruthy();
    expect(screen.getByTestId('wallet-delete')).toBeTruthy();
  });
  test('an Admin has archive but not delete, and the menu has no Delete either', async () => {
    mockScope.value = inFamily('ADMIN');
    await mount();
    expect(await screen.findByTestId('wallet-archive')).toBeTruthy();
    expect(screen.queryByTestId('wallet-delete')).toBeNull();
    await fireEvent.press(screen.getByTestId('wallet-menu'));
    const buttons = ((Alert.alert as unknown as jest.Mock).mock.calls.at(-1) as any[])[2] as Array<{ text: string }>;
    expect(buttons.map(b => b.text)).not.toContain('Delete wallet');
    expect(buttons.map(b => b.text)).toContain('Archive');
  });
  test.each(['MEMBER', 'VIEWER'])('a %s sees the wallet but cannot manage it, and the menu does nothing', async role => {
    mockScope.value = inFamily(role);
    await mount();
    await screen.findByText('Household');
    expect(screen.queryByTestId('wallet-archive')).toBeNull();
    expect(screen.queryByTestId('wallet-delete')).toBeNull();
    await fireEvent.press(screen.getByTestId('wallet-menu'));
    expect(Alert.alert).not.toHaveBeenCalled();
  });
  test('account details that the server withheld are simply not shown', async () => {
    mockScope.value = inFamily('MEMBER');
    svc.getWallet.mockResolvedValue(wallet({ accountNumber: null, accountHolder: null, last4: null }));
    await mount();
    await screen.findByText('Household');
    expect(screen.queryByText('Account number')).toBeNull();
  });
});
