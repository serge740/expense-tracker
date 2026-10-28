import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import DebtLedgerScreen from '@/app/(dashboard)/debt-ledger';
import type { Debt } from '@/services/debt.service';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@/services/debt.service', () => ({ getDebts: jest.fn(), getLedger: jest.fn() }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)',
    buttonBg: '#00627F', headerBg: '#00627F', text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9',
    border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));

type Fn = jest.Mock<(...a: any[]) => Promise<any>>;
const svc = require('@/services/debt.service') as { getDebts: Fn; getLedger: Fn };
const { router } = require('expo-router') as { router: { push: jest.Mock } };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const debt = (o: Partial<Debt> = {}): Debt => ({
  id: 'd1', kind: 'BORROWED', person: 'John', phone: null, amount: 200000, paid: 80000, writtenOffAmount: 0, remaining: 120000, currency: 'RWF',
  date: '2030-10-12T10:00:00Z', dueDate: null, note: null, walletId: null, principalTransactionId: 'p', status: 'OPEN', archived: false, overdue: false,
  nextDueAt: '2030-10-25T09:00:00Z', remindersOn: true, reminderId: null, reminderStatus: null, nextReminderAt: null,
  payments: [{ id: 'pay1', amount: 80000, date: '2030-10-18T10:00:00Z', walletId: null, note: null }], installments: [], ...o,
});
const ledger = (kind: 'BORROWED' | 'LENT') => ({
  kind, currencies: [{ currency: 'RWF', taken: 300000, paid: 80000, writtenOff: 0, remaining: 220000, debtCount: 2, openCount: 2, settledCount: 0, closedOutCount: 0, overdueCount: 0 }],
  debtCount: 2, openCount: 2, settledCount: 0, closedOutCount: 0, overdueCount: 0,
});

async function mount() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LanguageProvider><DebtLedgerScreen /></LanguageProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.current = {};
  svc.getLedger.mockImplementation(async (kind: any) => ledger(kind));
  svc.getDebts.mockResolvedValue([
    debt(),
    debt({ id: 'd2', person: 'Aline', amount: 50000, paid: 0, remaining: 50000, payments: [], nextDueAt: '2030-10-20T09:00:00Z', overdue: true }),
    debt({ id: 'c1', kind: 'LENT', person: 'Eric', amount: 120000, paid: 40000, remaining: 80000 }),
    debt({ id: 'd3', person: 'Marie', status: 'SETTLED', paid: 30000, amount: 30000, remaining: 0, date: '2030-09-01T00:00:00Z' }),
  ]);
});
afterEach(cleanup);

describe('Loan wallet screen', () => {
  test('shows one card per debt that was created, and only debts (no credits)', async () => {
    await mount();
    expect(await screen.findByText('John')).toBeTruthy();
    expect(screen.getByText('Aline')).toBeTruthy();
    expect(screen.getByText('Marie')).toBeTruthy();
    expect(screen.queryByText('Eric')).toBeNull();
    expect(screen.getAllByTestId('debt-card')).toHaveLength(3);
  });

  test('it does not list payment records or mix them in with the debts', async () => {
    await mount();
    await screen.findByText('John');
    expect(screen.queryByText('Related transactions')).toBeNull();
    expect(screen.queryByText(/Repaid/)).toBeNull();
    expect(screen.queryByText('Load more')).toBeNull();
  });

  test('each card shows what is paid and what is left', async () => {
    await mount();
    await screen.findByText('John');
    expect(screen.getByText(/^Paid .*80,000/)).toBeTruthy();
    expect(screen.getByText(/^Left .*120,000/)).toBeTruthy();
  });

  test('open ones come first (the overdue one on top), closed ones after', async () => {
    await mount();
    await screen.findByText('John');
    const names = screen.getAllByTestId('debt-card').map(c => c.props.accessibilityLabel.split(',')[0]);
    expect(names).toEqual(['Aline', 'John', 'Marie']);
  });

  test('Open and Closed filters', async () => {
    await mount();
    await screen.findByText('John');
    await fireEvent.press(screen.getByText('Closed'));
    expect(screen.getAllByTestId('debt-card')).toHaveLength(1);
    expect(screen.getByText('Marie')).toBeTruthy();
    await fireEvent.press(screen.getByText('Open'));
    expect(screen.getAllByTestId('debt-card')).toHaveLength(2);
    expect(screen.queryByText('Marie')).toBeNull();
    await fireEvent.press(screen.getByText('All'));
    expect(screen.getAllByTestId('debt-card')).toHaveLength(3);
  });

  test('tapping a card opens that debt\'s details', async () => {
    await mount();
    await fireEvent.press((await screen.findByText('John')));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/(dashboard)/debts', params: { openId: 'd1' } });
  });

  test('the summary on top is for debts', async () => {
    await mount();
    await screen.findByText('John');
    expect(svc.getLedger).toHaveBeenCalledWith('BORROWED');
    expect(screen.getByText('Loan wallet')).toBeTruthy();
  });

  test('says so when there are none', async () => {
    svc.getDebts.mockResolvedValue([debt({ id: 'c1', kind: 'LENT', person: 'Eric' })]);
    await mount();
    expect(await screen.findByText('Nothing here yet.')).toBeTruthy();
  });

  test('does not crash when loading fails', async () => {
    svc.getDebts.mockRejectedValue(new Error('Network Error'));
    svc.getLedger.mockRejectedValue(new Error('Network Error'));
    await mount();
    expect(await screen.findByText('Nothing here yet.')).toBeTruthy();
  });
});

describe('Debt wallet screen', () => {
  beforeEach(() => { mockParams.current = { kind: 'LENT' }; });

  test('shows only credits, and says "Received"', async () => {
    await mount();
    expect(await screen.findByText('Eric')).toBeTruthy();
    expect(screen.queryByText('John')).toBeNull();
    expect(screen.getAllByTestId('debt-card')).toHaveLength(1);
    expect(screen.getByText(/^Received .*40,000/)).toBeTruthy();
    expect(screen.getByText('Debt wallet')).toBeTruthy();
    expect(svc.getLedger).toHaveBeenCalledWith('LENT');
  });

  test('tapping a credit opens its details', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('Eric'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/(dashboard)/debts', params: { openId: 'c1' } });
  });
});
