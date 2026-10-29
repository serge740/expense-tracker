import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import { PreferencesProvider } from '@/context/preferences-context';
import HomeScreen from '@/app/(dashboard)/index';
import type { HomeSummary } from '@/services/home.service';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@/components/fade-in-view', () => ({ FadeInView: ({ children }: any) => children }));
jest.mock('@/components/budget-modal', () => ({ BudgetModal: () => null }));
jest.mock('@/services/client-auth.service', () => ({ getMe: jest.fn() }));
jest.mock('@/services/budget.service', () => ({ getCurrentBudget: jest.fn() }));
jest.mock('@/services/home.service', () => ({ getHomeSummary: jest.fn() }));
jest.mock('@/services/wallet.service', () => ({ getWalletOverview: jest.fn() }));
jest.mock('@/services/transaction.service', () => ({ getRecentTransactions: jest.fn(), CATEGORY_ICON: {}, formatSubtitle: () => 'Today · Household' }));
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
const auth = require('@/services/client-auth.service') as { getMe: Fn };
const budgetSvc = require('@/services/budget.service') as { getCurrentBudget: Fn };
const homeSvc = require('@/services/home.service') as { getHomeSummary: Fn };
const walletSvc = require('@/services/wallet.service') as { getWalletOverview: Fn };
const txSvc = require('@/services/transaction.service') as { getRecentTransactions: Fn };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const family = { id: 'fam-12345678', name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' };
const inFamily = (role: string) => ({
  ready: true, isFamily: true, scope: 'family', family, role, switchTo: jest.fn(async () => {}),
  can: (a: string) => ({ OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false } as Record<string, boolean>)[role] || a === 'tx.add',
});
const personal = () => ({ ready: true, isFamily: false, scope: 'personal', family: null, role: null, can: () => true, switchTo: jest.fn(async () => {}) });

const familySummary = (): HomeSummary => ({
  month: 10, year: 2030, includeLoans: true,
  totals: { income: 1000000, expense: 550000, net: 450000 },
  loans: { out: 0, in: 0, borrowed: 0 }, owe: {}, owed: {}, scheduled: { waiting: 0, next: null },
  attention: [], attentionTotal: 0, netWorth: [{ currency: 'RWF', wallets: 1500000, owed: 0, owe: 0, total: 1500000 }],
} as HomeSummary);
const row = (o: Record<string, unknown> = {}) => ({
  id: 't1', type: 'EXPENSE', category: 'food', title: 'Groceries', subCategory: null, description: null, amount: -42300, date: '2030-10-20T10:00:00Z',
  walletId: 'fw1', receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null, ...o,
});

async function mount() {
  await render(<SafeAreaProvider initialMetrics={metrics}><LanguageProvider><PreferencesProvider><HomeScreen /></PreferencesProvider></LanguageProvider></SafeAreaProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockScope.value = inFamily('OWNER');
  auth.getMe.mockResolvedValue({ firstName: 'Aline' });
  budgetSvc.getCurrentBudget.mockResolvedValue({ limit: 1000000, spent: 550000, remaining: 450000, percentage: 55, month: 10, year: 2030 });
  homeSvc.getHomeSummary.mockResolvedValue(familySummary());
  walletSvc.getWalletOverview.mockResolvedValue({ base: 'RWF', total: 1500000, yesterday: 1500000, change: 0, walletCount: 2, byCurrency: { RWF: 1500000 }, unconverted: [], rates: {}, ratesUpdatedAt: null });
  txSvc.getRecentTransactions.mockResolvedValue([
    row({ id: 't1', title: 'Groceries', author: { clientId: 'grace', name: 'Grace Uwase', isYou: false } }),
    row({ id: 't2', title: 'Fuel', author: { clientId: 'aline', name: 'Aline Uwase', isYou: true } }),
  ]);
});
afterEach(cleanup);

describe('Home inside a family', () => {
  test('shows the family balance in the family currency, and no loan bar, debt cards or Include-loans switch', async () => {
    await mount();
    expect(await screen.findByTestId('family-balance')).toBeTruthy();
    await waitFor(() => expect(walletSvc.getWalletOverview).toHaveBeenCalledWith('RWF'));
    expect(screen.getByTestId('family-balance-amount')).toHaveTextContent(/1,500,000/);
    expect(screen.queryByText('Include loans & debts')).toBeNull();
    expect(screen.queryByText('Loans & debts')).toBeNull();
    expect(screen.queryByText('Needs attention')).toBeNull();
  });

  test('the scope pill shows the family name', async () => {
    await mount();
    expect(await screen.findByText('Mwiza Family')).toBeTruthy();
  });

  test('every recent row says who added it ("you" for your own)', async () => {
    await mount();
    expect(await screen.findByText('Today · Household · Grace Uwase')).toBeTruthy();
    expect(screen.getByText('Today · Household · you')).toBeTruthy();
  });

  test('only All, Income and Expense chips are offered, and choosing one asks the server for it without touching the saved choice', async () => {
    await mount();
    await screen.findByText('Groceries');
    expect(screen.getByText('Expense')).toBeTruthy();
    expect(screen.queryByText('Loan')).toBeNull();
    expect(screen.queryByText('Debt')).toBeNull();
    expect(screen.queryByText('Scheduled')).toBeNull();
    await fireEvent.press(screen.getByText('Expense'));
    await waitFor(() => expect(txSvc.getRecentTransactions).toHaveBeenLastCalledWith(5, 'expense', true));
  });

  test('the Owner can edit the budget', async () => {
    await mount();
    expect(await screen.findByTestId('edit-budget')).toBeTruthy();
  });
  test.each(['MEMBER', 'VIEWER'])('a %s sees the budget but cannot edit it', async role => {
    mockScope.value = inFamily(role);
    await mount();
    await screen.findByText(/Budget/);
    expect(screen.queryByTestId('edit-budget')).toBeNull();
  });
  test('with no family budget set, a Member is not invited to set one; an Admin is', async () => {
    budgetSvc.getCurrentBudget.mockResolvedValue({ limit: 0, spent: 0, remaining: 0, percentage: 0, month: 10, year: 2030 });
    mockScope.value = inFamily('MEMBER');
    await mount();
    await screen.findByText('Groceries');
    expect(screen.queryByTestId('set-budget')).toBeNull();
    await cleanup();
    mockScope.value = inFamily('ADMIN');
    await mount();
    expect(await screen.findByTestId('set-budget')).toBeTruthy();
  });

  test('a family with no wallets yet says so in the balance card', async () => {
    walletSvc.getWalletOverview.mockResolvedValue({ base: 'RWF', total: 0, yesterday: 0, change: 0, walletCount: 0, byCurrency: {}, unconverted: [], rates: {}, ratesUpdatedAt: null });
    await mount();
    expect(await screen.findByText('The family has no wallet yet.')).toBeTruthy();
  });
  test('a wallet in a currency with no rate is listed separately, not guessed at', async () => {
    walletSvc.getWalletOverview.mockResolvedValue({ base: 'RWF', total: 1000, yesterday: 1000, change: 0, walletCount: 2, byCurrency: { RWF: 1000, XYZ: 50 }, unconverted: ['XYZ'], rates: {}, ratesUpdatedAt: null });
    await mount();
    expect(await screen.findByTestId('family-balance-separate')).toBeTruthy();
    expect(screen.getByText(/Wallets in these currencies have no known rate/)).toBeTruthy();
  });
});

describe('Home in Personal is unchanged', () => {
  beforeEach(() => { mockScope.value = personal(); homeSvc.getHomeSummary.mockResolvedValue({ ...familySummary(), loans: { out: 1, in: 1, borrowed: 1 } }); });
  test('no family balance card, the loan switch and every chip are there, and the budget can be edited', async () => {
    txSvc.getRecentTransactions.mockResolvedValue([row()]);
    await mount();
    await screen.findByText('Groceries');
    expect(screen.queryByTestId('family-balance')).toBeNull();
    expect(walletSvc.getWalletOverview).not.toHaveBeenCalled();
    expect(screen.getByText('Loan')).toBeTruthy();
    expect(screen.getByText('Scheduled')).toBeTruthy();
    expect(screen.getByTestId('edit-budget')).toBeTruthy();
    expect(screen.queryByText(/ · you$/)).toBeNull();
  });
});
