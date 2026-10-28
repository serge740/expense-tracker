import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import DebtsScreen from '@/app/(dashboard)/debts';
import type { Debt } from '@/services/debt.service';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@/services/debt.service', () => ({
  getDebts: jest.fn(), getArchivedDebts: jest.fn(), getDebtSummary: jest.fn(), addDebtPayment: jest.fn(), removeDebtPayment: jest.fn(),
  deleteDebt: jest.fn(), createDebt: jest.fn(), writeOffDebt: jest.fn(), reopenDebt: jest.fn(), archiveDebt: jest.fn(), restoreDebt: jest.fn(),
  shareDebtStatement: jest.fn(), addInstallment: jest.fn(), moveInstallment: jest.fn(), skipInstallment: jest.fn(), updateDebt: jest.fn(),
}));
jest.mock('@/services/wallet.service', () => ({ getWallets: jest.fn() }));
jest.mock('@/services/reminder.service', () => ({ wakeReminder: jest.fn() }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)',
    buttonBg: '#00627F', headerBg: '#00627F', text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9',
    border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));

type Fn = jest.Mock<(...a: any[]) => Promise<any>>;
const svc = require('@/services/debt.service') as Record<string, Fn>;
const walletSvc = require('@/services/wallet.service') as { getWallets: Fn };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const wallets = [
  { id: 'w1', name: 'MoMo', currency: 'RWF', archived: false, isDefault: false, color: 'teal', type: 'MOBILE_MONEY', bank: 'T', balance: 1 },
  { id: 'w2', name: 'Bank', currency: 'RWF', archived: false, isDefault: true, color: 'teal', type: 'CHECKING', bank: 'T', balance: 1 },
];
const debt = (o: Partial<Debt> = {}): Debt => ({
  id: 'd1', kind: 'BORROWED', person: 'John', phone: null, amount: 200000, paid: 0, writtenOffAmount: 0, remaining: 200000, currency: 'RWF',
  date: '2030-10-12T10:00:00Z', dueDate: '2030-12-01T10:00:00Z', note: null, walletId: null, principalTransactionId: 'p', status: 'OPEN', archived: false,
  overdue: false, nextDueAt: '2030-12-01T10:00:00Z', remindersOn: true, reminderId: null, reminderStatus: null, nextReminderAt: null, payments: [], installments: [], ...o,
});

async function mount() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LanguageProvider><DebtsScreen /></LanguageProvider>
    </SafeAreaProvider>,
  );
}
const alsoCredit = debt({ id: 'c1', kind: 'LENT', person: 'Eric', amount: 120000, remaining: 120000, nextDueAt: null, dueDate: null, remindersOn: false });

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.current = {};
  svc.getDebts.mockResolvedValue([debt(), alsoCredit]);
  svc.getArchivedDebts.mockResolvedValue([]);
  svc.getDebtSummary.mockResolvedValue({ owe: { RWF: 200000 }, owed: { RWF: 120000 }, openCount: 2, overdue: 0 });
  svc.createDebt.mockResolvedValue({});
  svc.addDebtPayment.mockResolvedValue({});
  walletSvc.getWallets.mockResolvedValue(wallets);
});
afterEach(cleanup);

describe('New loan or debt: the wallet choice', () => {
  const open = async () => {
    await mount();
    await screen.findByText('John');
    await fireEvent.press(screen.getByLabelText('New loan or debt'));
    await screen.findByText('Borrowed from');
  };

  test('a DEBT has no wallet choice at all', async () => {
    await open();
    expect(screen.queryByText(/Money came from/)).toBeNull();
    expect(screen.queryByText('Bank')).toBeNull();
    expect(screen.queryByText('MoMo')).toBeNull();
  });

  test('saving a debt sends no wallet, and says which currency it is in', async () => {
    await open();
    await fireEvent.changeText(screen.getByPlaceholderText('Name'), 'Aline');
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '5000');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(svc.createDebt).toHaveBeenCalledTimes(1));
    const body = svc.createDebt.mock.calls[0][0];
    expect(body).toMatchObject({ kind: 'BORROWED', person: 'Aline', amount: 5000 });
    expect(body.currency).toBeTruthy();
    expect(body.walletId).toBeUndefined();
  });

  test('a CREDIT keeps the wallet choice, starting on the default wallet', async () => {
    await open();
    await fireEvent.press(screen.getByText('Debt · I lent'));
    expect(await screen.findByText(/Money came from/)).toBeTruthy();
    expect(screen.getByText('Bank')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Name'), 'Cara');
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '4000');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(svc.createDebt).toHaveBeenCalledTimes(1));
    expect(svc.createDebt.mock.calls[0][0]).toMatchObject({ kind: 'LENT', person: 'Cara', amount: 4000, walletId: 'w2' });
  });

  test('a credit can pick another wallet, or none', async () => {
    await open();
    await fireEvent.press(screen.getByText('Debt · I lent'));
    await fireEvent.press(await screen.findByText('MoMo'));
    await fireEvent.changeText(screen.getByPlaceholderText('Name'), 'Cara');
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '4000');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(svc.createDebt).toHaveBeenCalledTimes(1));
    expect(svc.createDebt.mock.calls[0][0].walletId).toBe('w1');
  });

  test('a credit with "None" chosen sends no wallet (it is still recorded by the server)', async () => {
    await open();
    await fireEvent.press(screen.getByText('Debt · I lent'));
    await fireEvent.press(await screen.findByText('None'));
    await fireEvent.changeText(screen.getByPlaceholderText('Name'), 'Cara');
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '4000');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(svc.createDebt).toHaveBeenCalledTimes(1));
    expect(svc.createDebt.mock.calls[0][0].walletId).toBeUndefined();
  });

  test('switching back from credit to debt hides the wallet choice again and sends none', async () => {
    await open();
    await fireEvent.press(screen.getByText('Debt · I lent'));
    expect(await screen.findByText(/Money came from/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Loan · I borrowed'));
    expect(screen.queryByText(/Money came from/)).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText('Name'), 'Aline');
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '5000');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(svc.createDebt).toHaveBeenCalledTimes(1));
    expect(svc.createDebt.mock.calls[0][0].walletId).toBeUndefined();
  });
});

describe('Debt screen: recording a payment', () => {
  test('a debt shows its details and has no wallet choice; the payment is sent without a wallet', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('John'));
    expect(await screen.findByTestId('debt-info')).toBeTruthy();
    expect(screen.getByText('DETAILS')).toBeTruthy();
    expect(screen.queryByText(/Into wallet/)).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '50,000');
    await fireEvent.press(screen.getAllByText('Record payment').at(-1)!);
    await waitFor(() => expect(svc.addDebtPayment).toHaveBeenCalledTimes(1));
    expect(svc.addDebtPayment.mock.calls[0]).toEqual(['d1', { amount: 50000 }]);
  });

  test('a credit keeps "Into wallet", starting on the default wallet', async () => {
    await mount();
    await screen.findByText('John');
    await fireEvent.press(screen.getByText('Debt'));
    await fireEvent.press(await screen.findByText('Eric'));
    expect(await screen.findByText(/Into wallet/)).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '40,000');
    await fireEvent.press(screen.getAllByText('Record payment').at(-1)!);
    await waitFor(() => expect(svc.addDebtPayment).toHaveBeenCalledTimes(1));
    expect(svc.addDebtPayment.mock.calls[0]).toEqual(['c1', { amount: 40000, walletId: 'w2' }]);
  });
});

describe('Debt screen: statement', () => {
  test('the statement button builds and shares the PDF for that debt', async () => {
    svc.shareDebtStatement.mockResolvedValue(undefined);
    await mount();
    await fireEvent.press(await screen.findByText('John'));
    await fireEvent.press(await screen.findByText('Share statement (PDF)'));
    await waitFor(() => expect(svc.shareDebtStatement).toHaveBeenCalledWith('d1'));
  });
});
