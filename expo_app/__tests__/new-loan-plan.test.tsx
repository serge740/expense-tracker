import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import DebtsScreen from '@/app/(dashboard)/debts';
import type { Debt } from '@/services/debt.service';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
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

const existing: Debt = {
  id: 'd1', kind: 'BORROWED', person: 'John', phone: null, amount: 200000, paid: 0, writtenOffAmount: 0, remaining: 200000, currency: 'RWF',
  date: '2030-10-12T10:00:00Z', dueDate: '2030-12-01T10:00:00Z', note: null, walletId: null, principalTransactionId: 'p', status: 'OPEN', archived: false,
  overdue: false, nextDueAt: '2030-12-01T10:00:00Z', remindersOn: true, reminderId: null, reminderStatus: null, nextReminderAt: null, payments: [], installments: [], plan: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  svc.getDebts.mockResolvedValue([existing]);
  svc.getArchivedDebts.mockResolvedValue([]);
  svc.getDebtSummary.mockResolvedValue({ owe: { RWF: 200000 }, owed: {}, openCount: 1, overdue: 0 });
  svc.createDebt.mockResolvedValue({});
  walletSvc.getWallets.mockResolvedValue([]);
});
afterEach(cleanup);

async function openForm() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LanguageProvider><DebtsScreen /></LanguageProvider>
    </SafeAreaProvider>,
  );
  await screen.findByText('John');
  await fireEvent.press(screen.getByLabelText('New loan or debt'));
  await screen.findByText('Borrowed from');
}
const fillLoan = async (amount = '200000') => {
  await fireEvent.changeText(screen.getByPlaceholderText('Name'), 'Bank');
  await fireEvent.changeText(screen.getByPlaceholderText('0'), amount);
};

describe('A new loan with an estimated payment', () => {
  test('the field is there for a loan, hidden for a debt owed to me', async () => {
    await openForm();
    expect(screen.getByLabelText('Estimated payment (optional)')).toBeTruthy();
    await fireEvent.press(screen.getByText('Debt · I lent'));
    await waitFor(() => expect(screen.queryByLabelText('Estimated payment (optional)')).toBeNull());
    await fireEvent.press(screen.getByText('Loan · I borrowed'));
    expect(await screen.findByLabelText('Estimated payment (optional)')).toBeTruthy();
  });

  test('without an estimate nothing about a plan is sent', async () => {
    await openForm();
    await fillLoan();
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(svc.createDebt).toHaveBeenCalledTimes(1));
    const body = svc.createDebt.mock.calls[0][0];
    expect(body.planAmount).toBeUndefined();
    expect(body.planRepeat).toBeUndefined();
  });

  test('typing an estimate shows what it adds up to, and sends the amount, the repeat and the time zone', async () => {
    await openForm();
    await fillLoan('200000');
    await fireEvent.changeText(screen.getByLabelText('Estimated payment (optional)'), '50,000');
    expect(await screen.findByTestId('plan-summary')).toBeTruthy();
    expect(screen.getByTestId('plan-summary').props.children).toMatch(/About 4 payments/);
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(svc.createDebt).toHaveBeenCalledTimes(1));
    const body = svc.createDebt.mock.calls[0][0];
    expect(body).toMatchObject({ kind: 'BORROWED', amount: 200000, planAmount: 50000, planRepeat: { unit: 'MONTH', every: 1 } });
    expect(typeof body.planTimezone).toBe('string');
    expect(body.dueDate).toBeTruthy();   // the plan starts from the first pay date
  });

  test('an estimate above the loan is refused and nothing is saved', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await openForm();
    await fillLoan('100000');
    await fireEvent.changeText(screen.getByLabelText('Estimated payment (optional)'), '150000');
    expect(screen.getByTestId('plan-error')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));
    expect(alert).toHaveBeenCalled();
    expect(svc.createDebt).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  test('changing the loan amount updates the summary', async () => {
    await openForm();
    await fillLoan('100000');
    await fireEvent.changeText(screen.getByLabelText('Estimated payment (optional)'), '50000');
    expect((await screen.findByTestId('plan-summary')).props.children).toMatch(/About 2 payments/);
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '300000');
    await waitFor(() => expect(screen.getByTestId('plan-summary').props.children).toMatch(/About 6 payments/));
  });
});
