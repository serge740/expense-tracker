import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import { PreferencesProvider } from '@/context/preferences-context';
import WalletsScreen from '@/app/(dashboard)/wallets';
import type { Wallet } from '@/services/wallet.service';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@/services/wallet.service', () => ({
  getWallets: jest.fn(), getDailyFlow: jest.fn(), getActivity: jest.fn(), getBalanceHistory: jest.fn(), deleteWallet: jest.fn(), updateWallet: jest.fn(),
}));
jest.mock('@/components/wallet-form-modal', () => ({ WalletFormModal: () => null }));
jest.mock('@/components/wallet/wallet-hero-card', () => ({ WalletHeroCard: ({ wallet }: any) => require('react').createElement(require('react-native').Text, null, wallet.name) }));
jest.mock('@/components/wallet/flow-chart', () => ({ FlowChart: () => null }));
jest.mock('@/components/debt/ledger-cards', () => ({ LedgerCards: () => require('react').createElement(require('react-native').Text, { testID: 'ledger-cards' }, 'ledger') }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', surface: '#FFFFFF', primary: '#5B3FD0', primaryBg: 'rgba(91,63,208,0.1)', buttonBg: '#5B3FD0', headerBg: '#5B3FD0',
    text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9', border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', isDark: false,
  }),
}));
const mockScope: { value: any } = { value: {} };
jest.mock('@/context/scope-context', () => ({ useScope: () => mockScope.value }));

type Fn = jest.Mock<(...a: any[]) => Promise<any>>;
const svc = require('@/services/wallet.service') as Record<'getWallets' | 'getDailyFlow' | 'getActivity' | 'getBalanceHistory' | 'deleteWallet' | 'updateWallet', Fn>;
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const wallet = (o: Partial<Wallet> = {}) => ({ id: 'fw1', name: 'Household', bank: 'Cash', currency: 'RWF', balance: 10000, color: 'teal', walletType: 'CASH', last4: null, archived: false, isDefault: true, ...o }) as unknown as Wallet;
const family = { id: 'fam-12345678', name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' };
const MATRIX: Record<string, Record<string, boolean>> = {
  OWNER:  { 'wallet.manage': true,  'wallet.delete': true,  'tx.add': true },
  ADMIN:  { 'wallet.manage': true,  'wallet.delete': false, 'tx.add': true },
  MEMBER: { 'wallet.manage': false, 'wallet.delete': false, 'tx.add': true },
  VIEWER: { 'wallet.manage': false, 'wallet.delete': false, 'tx.add': false },
};
const inFamily = (role: string) => ({ ready: true, isFamily: true, scope: 'family', family, role, switchTo: jest.fn(), can: (a: string) => !!MATRIX[role][a] });
const personal = () => ({ ready: true, isFamily: false, scope: 'personal', family: null, role: null, switchTo: jest.fn(), can: () => true });
const mount = () => render(<SafeAreaProvider initialMetrics={metrics}><LanguageProvider><PreferencesProvider><WalletsScreen /></PreferencesProvider></LanguageProvider></SafeAreaProvider>);

/** The buttons of the last Alert, by label. */
const alertButtons = () => ((Alert.alert as unknown as jest.Mock).mock.calls.at(-1) as any[])[2] as Array<{ text: string; onPress?: () => void }>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  svc.getWallets.mockResolvedValue([wallet()]);
  svc.getDailyFlow.mockResolvedValue({ base: 'RWF', days: [], totalIn: 0, totalOut: 0 });
  svc.getActivity.mockResolvedValue([]);
  svc.getBalanceHistory.mockResolvedValue({ currency: 'RWF', points: [] });
  svc.deleteWallet.mockResolvedValue({ success: true });
  svc.updateWallet.mockResolvedValue({});
  mockScope.value = inFamily('OWNER');
});
afterEach(cleanup);

describe('Wallets inside a family', () => {
  test('shows the family name on the pill and the family wallet', async () => {
    await mount();
    expect(await screen.findByText('Mwiza Family')).toBeTruthy();
    expect(await screen.findByText('Household')).toBeTruthy();
  });

  test('no loan or debt summary cards (they are personal)', async () => {
    await mount();
    await screen.findByText('Household');
    expect(screen.queryByTestId('ledger-cards')).toBeNull();
  });

  test.each(['OWNER', 'ADMIN'])('%s can add a wallet and open the wallet menu', async role => {
    mockScope.value = inFamily(role);
    await mount();
    expect(await screen.findByTestId('wallets-add')).toBeTruthy();
    expect(screen.queryByTestId('wallets-manage-note')).toBeNull();
    await fireEvent(screen.getByText('Household'), 'longPress');
    expect(Alert.alert).toHaveBeenCalled();
  });

  test('the Owner\'s wallet menu has Delete; an Admin\'s does not', async () => {
    await mount();
    await fireEvent(await screen.findByText('Household'), 'longPress');
    expect(alertButtons().map(b => b.text)).toContain('Delete wallet');
    await cleanup();
    jest.clearAllMocks();
    mockScope.value = inFamily('ADMIN');
    await mount();
    await fireEvent(await screen.findByText('Household'), 'longPress');
    expect(alertButtons().map(b => b.text)).not.toContain('Delete wallet');
    expect(alertButtons().map(b => b.text)).toContain('Archive');
  });

  test.each(['MEMBER', 'VIEWER'])('a %s cannot add a wallet, gets no wallet menu, and is told who can', async role => {
    mockScope.value = inFamily(role);
    await mount();
    await screen.findByText('Household');
    expect(screen.queryByTestId('wallets-add')).toBeNull();
    expect(screen.getByTestId('wallets-manage-note')).toBeTruthy();
    expect(screen.getByText('Only the owner and admins can add or change family wallets.')).toBeTruthy();
    await fireEvent(screen.getByText('Household'), 'longPress');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test('a Viewer has no exchange button and no add-money / spend / transfer actions; a Member does', async () => {
    mockScope.value = inFamily('VIEWER');
    await mount();
    await screen.findByText('Household');
    expect(screen.queryByTestId('wallets-exchange')).toBeNull();
    expect(screen.queryByText('Add money')).toBeNull();
    await cleanup();
    mockScope.value = inFamily('MEMBER');
    await mount();
    await screen.findByText('Household');
    expect(screen.getByTestId('wallets-exchange')).toBeTruthy();
    expect(screen.getByText('Add money')).toBeTruthy();
  });

  test('a family with no wallet tells a Member that, and an Owner how to start', async () => {
    svc.getWallets.mockResolvedValue([]);
    mockScope.value = inFamily('MEMBER');
    await mount();
    expect(await screen.findByText('The family has no wallet yet.')).toBeTruthy();
    await cleanup();
    mockScope.value = inFamily('OWNER');
    await mount();
    expect(await screen.findByText('Create your first wallet to start tracking money in and out.')).toBeTruthy();
  });

  test('deleting a wallet that has history shows the server\'s reason in words', async () => {
    svc.deleteWallet.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 409, data: { code: 'WALLET_HAS_HISTORY', message: 'x' } } }));
    await mount();
    await fireEvent(await screen.findByText('Household'), 'longPress');
    alertButtons().find(b => b.text === 'Delete wallet')!.onPress!();
    alertButtons().find(b => b.text === 'Delete')!.onPress!();
    await waitFor(() => expect((Alert.alert as unknown as jest.Mock).mock.calls.at(-1)![1]).toBe('This wallet has transactions. Archive it instead.'));
  });
});

describe('Wallets in Personal (unchanged)', () => {
  beforeEach(() => { mockScope.value = personal(); });
  test('the add button, the menu with Delete, the actions and the loan summaries are all there', async () => {
    await mount();
    expect(await screen.findByTestId('wallets-add')).toBeTruthy();
    expect(screen.getByTestId('ledger-cards')).toBeTruthy();
    expect(screen.getByText('Add money')).toBeTruthy();
    expect(screen.queryByTestId('wallets-manage-note')).toBeNull();
    await fireEvent(screen.getByText('Household'), 'longPress');
    expect(alertButtons().map(b => b.text)).toContain('Delete wallet');
  });
});
