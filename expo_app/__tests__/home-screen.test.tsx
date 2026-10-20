import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
jest.mock('@/services/transaction.service', () => ({ getRecentTransactions: jest.fn(), CATEGORY_ICON: {}, formatSubtitle: () => 'Today · MoMo' }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)',
    buttonBg: '#00627F', headerBg: '#00627F', text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9',
    border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));

type Fn = jest.Mock<(...a: any[]) => Promise<any>>;
const auth = require('@/services/client-auth.service') as { getMe: Fn };
const budgetSvc = require('@/services/budget.service') as { getCurrentBudget: Fn };
const homeSvc = require('@/services/home.service') as { getHomeSummary: Fn };
const txSvc = require('@/services/transaction.service') as { getRecentTransactions: Fn };
const { router } = require('expo-router') as { router: { push: jest.Mock } };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const bucket = (o = {}) => ({ amount: 150000, count: 1, overdue: 1, nextDueAt: '2030-10-21T16:00:00Z', ...o });
const summary = (over: Partial<HomeSummary> = {}): HomeSummary => ({
  month: 10, year: 2030, includeLoans: true,
  totals: { income: 540000, expense: 350000, net: 190000 },
  loans: { out: 170000, in: 40000, borrowed: 200000 },
  owe: { RWF: bucket() }, owed: { RWF: bucket({ amount: 80000, overdue: 0 }) },
  scheduled: { waiting: 1, next: { id: 's1', title: 'Rent', nextDueAt: '2030-10-22T07:00:00Z' } },
  attention: [
    { source: 'DEBT', debtId: 'd1', kind: 'BORROWED', person: 'John', currency: 'RWF', remaining: 150000, dueAt: '2030-10-21T16:00:00Z', overdue: true },
    { source: 'SCHEDULED', occurrenceId: 'o1', scheduleId: 's1', title: 'Rent', txType: 'EXPENSE', currency: 'RWF', remaining: 5000, dueAt: '2030-10-22T07:00:00Z', overdue: false },
  ],
  attentionTotal: 2,
  netWorth: [{ currency: 'RWF', wallets: 1470000, owed: 80000, owe: 150000, total: 1400000 }],
  ...over,
});
const tx = (o: Record<string, unknown> = {}) => ({ id: 't1', type: 'EXPENSE', category: 'food', title: 'Groceries', amount: -18400, date: '2030-10-20T10:00:00Z', walletId: 'w1', receiptUrl: null, description: null, subCategory: null, debtRole: null, ...o });

async function mount() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LanguageProvider><PreferencesProvider><HomeScreen /></PreferencesProvider></LanguageProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  auth.getMe.mockResolvedValue({ firstName: 'Serge' });
  budgetSvc.getCurrentBudget.mockResolvedValue({ limit: 300000, spent: 186000, percentage: 62 });
  homeSvc.getHomeSummary.mockImplementation(async (p: any) => (p?.includeLoans === false
    ? summary({ includeLoans: false, totals: { income: 500000, expense: 180000, net: 320000 } }) : summary()));
  txSvc.getRecentTransactions.mockResolvedValue([tx()]);
});
afterEach(cleanup);

describe('Home dashboard', () => {
  test('shows the month figures from the server and the loans line', async () => {
    await mount();
    expect(await screen.findByText(/540,000/)).toBeTruthy();
    expect(screen.getByText(/350,000/)).toBeTruthy();
    expect(screen.getByText('Loans in these figures: spent 170,000 · received 40,000')).toBeTruthy();
    expect(screen.getByText('Borrowed 200,000 is never income')).toBeTruthy();
    expect(homeSvc.getHomeSummary).toHaveBeenCalledWith(expect.objectContaining({ includeLoans: true }));
  });

  test('switching "Include loans" off refreshes the figures and the feed, and is remembered', async () => {
    await mount();
    await screen.findByText(/540,000/);
    await fireEvent(screen.getByLabelText('Include loans'), 'valueChange', false);
    expect(await screen.findByText(/320,000/)).toBeTruthy();
    expect(screen.getByText('Loans left out: 170,000 out · 40,000 in')).toBeTruthy();
    expect(homeSvc.getHomeSummary).toHaveBeenLastCalledWith(expect.objectContaining({ includeLoans: false }));
    expect(txSvc.getRecentTransactions).toHaveBeenLastCalledWith(5, 'all', false);
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem('app_preferences_v1')) ?? '{}').includeLoans).toBe(false));
  });

  test('a chip tap refreshes only the feed, not the whole screen', async () => {
    await mount();
    await screen.findByText(/540,000/);
    const meBefore = auth.getMe.mock.calls.length;
    const summaryBefore = homeSvc.getHomeSummary.mock.calls.length;
    await fireEvent.press(screen.getByText('Debt'));
    await waitFor(() => expect(txSvc.getRecentTransactions).toHaveBeenLastCalledWith(5, 'debt', true));
    expect(auth.getMe.mock.calls.length).toBe(meBefore);
    expect(homeSvc.getHomeSummary.mock.calls.length).toBe(summaryBefore);
  });

  test('the chosen chip is remembered for next time', async () => {
    await mount();
    await screen.findByText(/540,000/);
    await fireEvent.press(screen.getByText('Credit'));
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem('app_preferences_v1')) ?? '{}').homeView).toBe('credit'));
  });

  test('a person who last used the Debt chip opens Home on it', async () => {
    await AsyncStorage.setItem('app_preferences_v1', JSON.stringify({ homeView: 'debt' }));
    await mount();
    await waitFor(() => expect(txSvc.getRecentTransactions).toHaveBeenCalledWith(5, 'debt', true));
  });

  test('the Debt chip with loans off explains why loans are listed', async () => {
    await mount();
    await screen.findByText(/540,000/);
    await fireEvent(screen.getByLabelText('Include loans'), 'valueChange', false);
    await fireEvent.press(screen.getByText('Debt'));
    expect(await screen.findByText(/These are loans/)).toBeTruthy();
  });

  test('shows debts, credits and scheduled cards plus what needs attention', async () => {
    await mount();
    expect(await screen.findByText('Debts & credits')).toBeTruthy();
    expect(screen.getByText('You owe')).toBeTruthy();
    expect(screen.getByText('Owed to you')).toBeTruthy();
    expect(screen.getByText('1 waiting')).toBeTruthy();
    expect(screen.getByText('Needs attention')).toBeTruthy();
    expect(screen.getByText('Pay John')).toBeTruthy();
    expect(screen.getByText('NET WORTH · RWF')).toBeTruthy();
  });

  test('a new person sees none of the debt sections', async () => {
    homeSvc.getHomeSummary.mockResolvedValue(summary({ owe: {}, owed: {}, scheduled: { waiting: 0, next: null }, attention: [], attentionTotal: 0, netWorth: [], loans: { out: 0, in: 0, borrowed: 0 } }));
    await mount();
    await screen.findByText(/540,000/);
    expect(screen.queryByText('Debts & credits')).toBeNull();
    expect(screen.queryByText('Needs attention')).toBeNull();
    expect(screen.queryByTestId('net-worth-row')).toBeNull();
  });

  test('tapping an overdue debt opens that debt; a scheduled one opens that schedule', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('Pay John'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/(dashboard)/debts', params: { openId: 'd1' } });
    await fireEvent.press(screen.getAllByText('Rent')[screen.getAllByText('Rent').length - 1]);
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/(dashboard)/scheduled', params: { id: 's1' } });
  });

  test('the cards open Debts and Scheduled', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('You owe'));
    expect(router.push).toHaveBeenLastCalledWith('/(dashboard)/debts');
    await fireEvent.press(screen.getByText('1 waiting'));
    expect(router.push).toHaveBeenLastCalledWith('/(dashboard)/scheduled');
  });

  test('"See all" opens History with the same chip and loans choice', async () => {
    await mount();
    await screen.findByText(/540,000/);
    await fireEvent.press(screen.getByText('Debt'));
    await fireEvent(screen.getByLabelText('Include loans'), 'valueChange', false);
    await fireEvent.press(screen.getByText('See all'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/(dashboard)/history', params: { view: 'debt', includeLoans: 'false' } });
  });

  test('borrowed money shows a Borrowed tag and is not coloured as income', async () => {
    txSvc.getRecentTransactions.mockResolvedValue([tx({ id: 't9', title: 'Borrowed from John', amount: 200000, type: 'INCOME', debtRole: 'BORROW_IN' })]);
    await mount();
    expect(await screen.findByText('Borrowed from John')).toBeTruthy();
    expect(screen.getByText('Borrowed')).toBeTruthy();
  });

  test('an empty chip says so, and the Scheduled chip explains in its own words', async () => {
    txSvc.getRecentTransactions.mockResolvedValue([]);
    await mount();
    await screen.findByText(/540,000/);
    await fireEvent.press(screen.getByText('Income'));
    expect(await screen.findByText('Nothing here yet.')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Scheduled').at(-1)!);      // the chip (the card above has the same word)
    expect(await screen.findByText('Nothing has been posted by a schedule yet.')).toBeTruthy();
  });

  test('the budget card says loans never count against it', async () => {
    await mount();
    expect(await screen.findByText('Loans never count against your budget.')).toBeTruthy();
  });

  test('a failed load does not crash: the header still renders', async () => {
    homeSvc.getHomeSummary.mockRejectedValue(new Error('Network Error'));
    txSvc.getRecentTransactions.mockRejectedValue(new Error('Network Error'));
    await mount();
    expect(await screen.findByText('Serge')).toBeTruthy();
    expect(screen.queryByText('Debts & credits')).toBeNull();
  });
});
