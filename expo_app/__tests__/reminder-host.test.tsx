import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import { ReminderModalHost } from '@/components/reminders/reminder-host';
import { requestReminderRefresh } from '@/utils/reminders';
import type { PendingReminder, PendingScheduledReminder } from '@/services/reminder.service';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/services/reminder.service', () => ({
  getPendingReminders: jest.fn(),
  snoozeReminder: jest.fn(),
  dismissReminder: jest.fn(),
  markReminderOpened: jest.fn(),
}));
jest.mock('@/services/debt.service', () => ({ addDebtPayment: jest.fn() }));
jest.mock('@/services/scheduled.service', () => ({ confirmOccurrence: jest.fn(), skipOccurrence: jest.fn() }));
jest.mock('@/services/wallet.service', () => ({ getWallets: jest.fn() }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)',
    buttonBg: '#00627F', headerBg: '#00627F', text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9',
    border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));

const reminders = require('@/services/reminder.service') as Record<'getPendingReminders' | 'snoozeReminder' | 'dismissReminder' | 'markReminderOpened', jest.Mock<(...a: any[]) => Promise<any>>>;
const debts = require('@/services/debt.service') as { addDebtPayment: jest.Mock<(...a: any[]) => Promise<any>> };
const wallets = require('@/services/wallet.service') as { getWallets: jest.Mock<(...a: any[]) => Promise<any>> };
const sched = require('@/services/scheduled.service') as Record<'confirmOccurrence' | 'skipOccurrence', jest.Mock<(...a: any[]) => Promise<any>>>;
const { router } = require('expo-router') as { router: { push: jest.Mock } };

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const rem = (over: Record<string, unknown> = {}): PendingReminder => ({
  source: 'DEBT', id: 'r1', debtId: 'd1', kind: 'BORROWED', person: 'John', currency: 'RWF', remaining: 150000,
  dueAt: '2020-10-21T16:00:00Z', overdue: true, fireCount: 3, lastFiredAt: 't1', ...over,
});

async function mount() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LanguageProvider><ReminderModalHost /></LanguageProvider>
    </SafeAreaProvider>,
  );
}

const alert = () => jest.spyOn(Alert, 'alert').mockImplementation(() => {});

beforeEach(() => {
  jest.clearAllMocks();
  reminders.getPendingReminders.mockResolvedValue([rem()]);
  reminders.snoozeReminder.mockResolvedValue({ id: 'r1', snoozedUntil: '' });
  reminders.dismissReminder.mockResolvedValue({ id: 'r1' });
  reminders.markReminderOpened.mockResolvedValue({ id: 'r1' });
  debts.addDebtPayment.mockResolvedValue({});
  sched.confirmOccurrence.mockResolvedValue({ occurrenceId: 'o1', status: 'POSTED', transactionId: 't1' });
  sched.skipOccurrence.mockResolvedValue({ occurrenceId: 'o1', status: 'SKIPPED' });
  wallets.getWallets.mockResolvedValue([]);
});
afterEach(cleanup);

describe('ReminderModalHost', () => {
  test('shows nothing when no reminder is waiting', async () => {
    reminders.getPendingReminders.mockResolvedValue([]);
    await mount();
    await waitFor(() => expect(reminders.getPendingReminders).toHaveBeenCalled());
    expect(screen.queryByTestId('reminder-popup')).toBeNull();
  });

  test('shows the waiting reminder: who, how much, overdue, how many times', async () => {
    await mount();
    expect(await screen.findByText('Pay John')).toBeTruthy();
    expect(screen.getByText(/150,000/)).toBeTruthy();       // shown with the currency symbol
    expect(screen.getByText('Overdue · Payment')).toBeTruthy();
    expect(screen.getByText(/reminded 3 times/)).toBeTruthy();
    expect(screen.getByText('Mark paid')).toBeTruthy();
  });

  test('a credit is worded from the lender\'s side', async () => {
    reminders.getPendingReminders.mockResolvedValue([rem({ kind: 'LENT', person: 'Eric', overdue: false, fireCount: 1 })]);
    await mount();
    expect(await screen.findByText('Eric owes you')).toBeTruthy();
    expect(screen.getByText('Mark received')).toBeTruthy();
    expect(screen.getByText('Due soon · Repayment')).toBeTruthy();
    expect(screen.queryByText(/reminded/)).toBeNull();
  });

  test('a queue can be stepped through', async () => {
    reminders.getPendingReminders.mockResolvedValue([rem(), rem({ id: 'r2', person: 'Aline', remaining: 50000 })]);
    await mount();
    expect(await screen.findByText('1 of 2')).toBeTruthy();
    await fireEvent.press(screen.getByText(/Next/));
    expect(screen.getByText('Pay Aline')).toBeTruthy();
    expect(screen.getByText('2 of 2')).toBeTruthy();
    await fireEvent.press(screen.getByText(/Previous/));
    expect(screen.getByText('Pay John')).toBeTruthy();
  });

  test('× hides it, a refresh with the same fire keeps it hidden, a new fire brings it back', async () => {
    await mount();
    await screen.findByText('Pay John');
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.queryByTestId('reminder-popup')).toBeNull();

    await act(async () => { requestReminderRefresh({ reset: false }); });
    expect(screen.queryByTestId('reminder-popup')).toBeNull();                  // closing is not an answer, but it does stay closed for now

    reminders.getPendingReminders.mockResolvedValue([rem({ lastFiredAt: 't2', fireCount: 4 })]);
    await act(async () => { requestReminderRefresh({ reset: false }); });
    expect(await screen.findByText('Pay John')).toBeTruthy();                   // it fired again
  });

  test('reopening the app brings a closed reminder back', async () => {
    await mount();
    await screen.findByText('Pay John');
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.queryByTestId('reminder-popup')).toBeNull();
    await act(async () => { requestReminderRefresh({ reset: true }); });
    expect(await screen.findByText('Pay John')).toBeTruthy();
  });

  test('× does not call the server (it is not an answer)', async () => {
    await mount();
    await screen.findByText('Pay John');
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(reminders.dismissReminder).not.toHaveBeenCalled();
    expect(reminders.snoozeReminder).not.toHaveBeenCalled();
  });

  test('Dismiss tells the server and reloads', async () => {
    await mount();
    await screen.findByText('Pay John');
    reminders.getPendingReminders.mockResolvedValue([]);
    await fireEvent.press(screen.getByText('Dismiss this reminder'));
    await waitFor(() => expect(reminders.dismissReminder).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(screen.queryByTestId('reminder-popup')).toBeNull());
  });

  test('a failed Dismiss shows the server message and keeps the popup', async () => {
    const a = alert();
    reminders.dismissReminder.mockRejectedValue({ response: { data: { message: 'This reminder is already closed' } } });
    await mount();
    await screen.findByText('Pay John');
    await fireEvent.press(screen.getByText('Dismiss this reminder'));
    await waitFor(() => expect(a).toHaveBeenCalled());
    expect(a.mock.calls[0][1]).toBe('This reminder is already closed');
    expect(screen.getByText('Pay John')).toBeTruthy();
    a.mockRestore();
  });

  test('Open goes to the debt and keeps the popup closed', async () => {
    await mount();
    await screen.findByText('Pay John');
    await fireEvent.press(screen.getByText('Open debt'));
    expect(reminders.markReminderOpened).toHaveBeenCalledWith('r1');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/(dashboard)/debts', params: { openId: 'd1' } });
    await waitFor(() => expect(screen.queryByTestId('reminder-popup')).toBeNull());
  });

  describe('snooze', () => {
    test('defaults to 1 hour', async () => {
      await mount();
      await screen.findByText('Pay John');
      await fireEvent.press(screen.getByText('Snooze'));
      expect(await screen.findByText('Snooze for…')).toBeTruthy();
      expect(screen.getByText(/You will be reminded at/)).toBeTruthy();
      reminders.getPendingReminders.mockResolvedValue([]);
      await fireEvent.press(screen.getAllByText('Snooze').at(-1)!);
      await waitFor(() => expect(reminders.snoozeReminder).toHaveBeenCalledWith('r1', { minutes: 60 }));
    });

    test('a chosen preset is what gets sent', async () => {
      await mount();
      await screen.findByText('Pay John');
      await fireEvent.press(screen.getByText('Snooze'));
      await fireEvent.press(await screen.findByText('10 min'));
      await fireEvent.press(screen.getAllByText('Snooze').at(-1)!);
      await waitFor(() => expect(reminders.snoozeReminder).toHaveBeenCalledWith('r1', { minutes: 10 }));
    });

    test('every preset is offered', async () => {
      await mount();
      await screen.findByText('Pay John');
      await fireEvent.press(screen.getByText('Snooze'));
      for (const label of ['10 min', '30 min', '1 hour', '1 day', '1 week', 'Pick date & time…']) {
        expect(await screen.findByText(label)).toBeTruthy();
      }
    });

    test('Cancel closes the sheet without calling the server', async () => {
      await mount();
      await screen.findByText('Pay John');
      await fireEvent.press(screen.getByText('Snooze'));
      await fireEvent.press(await screen.findByText('Cancel'));
      expect(screen.queryByText('Snooze for…')).toBeNull();
      expect(reminders.snoozeReminder).not.toHaveBeenCalled();
    });

    test('a refused snooze shows the message and stays open', async () => {
      const a = alert();
      reminders.snoozeReminder.mockRejectedValue({ response: { data: { message: 'Pick a time in the future' } } });
      await mount();
      await screen.findByText('Pay John');
      await fireEvent.press(screen.getByText('Snooze'));
      await fireEvent.press(screen.getAllByText('Snooze').at(-1)!);
      await waitFor(() => expect(a).toHaveBeenCalled());
      expect(a.mock.calls[0][1]).toBe('Pick a time in the future');
      expect(screen.getByText('Snooze for…')).toBeTruthy();
      a.mockRestore();
    });
  });

  describe('mark paid', () => {
    test('opens with what is left, then records a real payment', async () => {
      await mount();
      await screen.findByText('Pay John');
      await fireEvent.press(screen.getByText('Mark paid'));
      expect((await screen.findAllByText('Record payment')).length).toBe(2);   // sheet title + button
      expect(screen.getByDisplayValue('150000')).toBeTruthy();
      reminders.getPendingReminders.mockResolvedValue([]);
      await fireEvent.press(screen.getAllByText('Record payment').at(-1)!);
      await waitFor(() => expect(debts.addDebtPayment).toHaveBeenCalledWith('d1', { amount: 150000, walletId: undefined }));
      await waitFor(() => expect(screen.queryByTestId('reminder-popup')).toBeNull());
    });

    test('a part payment sends the typed amount', async () => {
      await mount();
      await screen.findByText('Pay John');
      await fireEvent.press(screen.getByText('Mark paid'));
      await fireEvent.changeText(await screen.findByDisplayValue('150000'), '50,000');
      await fireEvent.press(screen.getAllByText('Record payment').at(-1)!);
      await waitFor(() => expect(debts.addDebtPayment).toHaveBeenCalledWith('d1', { amount: 50000, walletId: undefined }));
    });

    test('more than what is left is refused before calling the server', async () => {
      const a = alert();
      await mount();
      await screen.findByText('Pay John');
      await fireEvent.press(screen.getByText('Mark paid'));
      await fireEvent.changeText(await screen.findByDisplayValue('150000'), '999999');
      await fireEvent.press(screen.getAllByText('Record payment').at(-1)!);
      expect(a).toHaveBeenCalled();
      expect(a.mock.calls[0][1]).toBe('That is more than what is left.');
      expect(debts.addDebtPayment).not.toHaveBeenCalled();
      a.mockRestore();
    });

    test('an empty or zero amount is refused', async () => {
      const a = alert();
      await mount();
      await screen.findByText('Pay John');
      await fireEvent.press(screen.getByText('Mark paid'));
      await fireEvent.changeText(await screen.findByDisplayValue('150000'), '0');
      await fireEvent.press(screen.getAllByText('Record payment').at(-1)!);
      expect(a).toHaveBeenCalled();
      expect(debts.addDebtPayment).not.toHaveBeenCalled();
      a.mockRestore();
    });

    test('a failed payment shows the message and keeps the sheet', async () => {
      const a = alert();
      debts.addDebtPayment.mockRejectedValue({ response: { data: { message: 'Choose a RWF wallet for this debt' } } });
      await mount();
      await screen.findByText('Pay John');
      await fireEvent.press(screen.getByText('Mark paid'));
      await fireEvent.press((await screen.findAllByText('Record payment')).at(-1)!);
      await waitFor(() => expect(a).toHaveBeenCalled());
      expect(a.mock.calls[0][1]).toBe('Choose a RWF wallet for this debt');
      expect(screen.getByText(/This adds a payment/)).toBeTruthy();
      a.mockRestore();
    });

    describe('wallets', () => {
      const credit = (over: Record<string, unknown> = {}) => rem({ kind: 'LENT', person: 'Eric', id: 'r2', debtId: 'd2', ...over });
      const two = [
        { id: 'w1', name: 'MoMo', currency: 'RWF', archived: false, isDefault: false },
        { id: 'w2', name: 'Bank', currency: 'RWF', archived: false, isDefault: true },
      ];
      const openPay = async (label: string) => {
        await screen.findByText(label);
        await fireEvent.press(screen.getByText(/Mark paid|Mark received/));
        await new Promise(r => setTimeout(r, 50));
      };

      test('a debt never shows a wallet choice, never loads wallets and never sends one', async () => {
        wallets.getWallets.mockResolvedValue(two);
        await mount();
        await openPay('Pay John');
        expect(screen.queryByText(/Into wallet/)).toBeNull();
        expect(screen.queryByText('MoMo')).toBeNull();
        expect(wallets.getWallets).not.toHaveBeenCalled();
        await fireEvent.press((await screen.findAllByText('Record payment')).at(-1)!);
        await waitFor(() => expect(debts.addDebtPayment).toHaveBeenCalledTimes(1));
        expect(debts.addDebtPayment.mock.calls[0]).toEqual(['d1', { amount: 150000 }]);
      });

      test('a credit repaid to me keeps the wallet choice, starting on the credit\'s own wallet', async () => {
        wallets.getWallets.mockResolvedValue(two);
        reminders.getPendingReminders.mockResolvedValue([credit({ walletId: 'w1' })]);
        await mount();
        await openPay('Eric owes you');
        expect(await screen.findByText('Bank')).toBeTruthy();
        await fireEvent.press((await screen.findAllByText('Record payment')).at(-1)!);
        await waitFor(() => expect(debts.addDebtPayment).toHaveBeenCalledWith('d2', { amount: 150000, walletId: 'w1' }));
      });

      test('with no wallet on the credit it starts on the default wallet', async () => {
        wallets.getWallets.mockResolvedValue(two);
        reminders.getPendingReminders.mockResolvedValue([credit()]);
        await mount();
        await openPay('Eric owes you');
        await fireEvent.press((await screen.findAllByText('Record payment')).at(-1)!);
        await waitFor(() => expect(debts.addDebtPayment).toHaveBeenCalledWith('d2', { amount: 150000, walletId: 'w2' }));
      });

      test('"No wallet" is still one tap away for a credit, and then none is sent', async () => {
        wallets.getWallets.mockResolvedValue(two);
        reminders.getPendingReminders.mockResolvedValue([credit()]);
        await mount();
        await openPay('Eric owes you');
        await fireEvent.press(await screen.findByText('None'));      // the "no wallet" chip
        await fireEvent.press((await screen.findAllByText('Record payment')).at(-1)!);
        await waitFor(() => expect(debts.addDebtPayment).toHaveBeenCalledTimes(1));
        expect(debts.addDebtPayment.mock.calls[0]).toEqual(['d2', { amount: 150000 }]);
      });

      test('only wallets in the credit\'s currency are offered', async () => {
        wallets.getWallets.mockResolvedValue([
          { id: 'w1', name: 'MoMo', currency: 'RWF', archived: false, isDefault: true },
          { id: 'w3', name: 'Dollar', currency: 'USD', archived: false, isDefault: false },
          { id: 'w4', name: 'Old', currency: 'RWF', archived: true, isDefault: false },
        ]);
        reminders.getPendingReminders.mockResolvedValue([credit()]);
        await mount();
        await openPay('Eric owes you');
        expect(await screen.findByText('MoMo')).toBeTruthy();
        expect(screen.queryByText('Dollar')).toBeNull();
        expect(screen.queryByText('Old')).toBeNull();
      });
    });
  });

  describe('scheduled items', () => {
    const scheduledRem = (over: Record<string, unknown> = {}) => ({
      source: 'SCHEDULED', id: 'r9', occurrenceId: 'o1', scheduleId: 's1', txType: 'EXPENSE', title: 'Electricity', currency: 'RWF',
      amount: 5000, remaining: 5000, walletId: 'w1', dueAt: '2020-10-21T16:00:00Z', overdue: true, fireCount: 2, lastFiredAt: 't1', ...over,
    }) as unknown as PendingScheduledReminder;

    test('a scheduled payment is worded as one, with Pay now / Open / Skip', async () => {
      reminders.getPendingReminders.mockResolvedValue([scheduledRem()]);
      await mount();
      expect(await screen.findByText('Electricity')).toBeTruthy();
      expect(screen.getByText('Overdue · Scheduled payment')).toBeTruthy();
      expect(screen.getByText(/5,000/)).toBeTruthy();
      expect(screen.getByText('Pay now')).toBeTruthy();
      expect(screen.getByText('Open')).toBeTruthy();
      expect(screen.getByText('Skip this date')).toBeTruthy();
      expect(screen.queryByText('Open debt')).toBeNull();
    });

    test('expected income says "Mark received"', async () => {
      reminders.getPendingReminders.mockResolvedValue([scheduledRem({ txType: 'INCOME', title: 'Salary', overdue: false })]);
      await mount();
      expect(await screen.findByText('Salary')).toBeTruthy();
      expect(screen.getByText('Due soon · Expected income')).toBeTruthy();
      expect(screen.getByText('Mark received')).toBeTruthy();
    });

    test('Pay now opens the confirm sheet and posts it unchanged (no overrides sent)', async () => {
      reminders.getPendingReminders.mockResolvedValue([scheduledRem()]);
      await mount();
      await screen.findByText('Electricity');
      await fireEvent.press(screen.getByText('Pay now'));
      expect(await screen.findByText('Confirm payment')).toBeTruthy();
      expect(screen.getByDisplayValue('5000')).toBeTruthy();
      reminders.getPendingReminders.mockResolvedValue([]);
      await fireEvent.press(screen.getByText('Confirm'));
      await waitFor(() => expect(sched.confirmOccurrence).toHaveBeenCalledWith('o1', {}));
      await waitFor(() => expect(screen.queryByTestId('reminder-popup')).toBeNull());
    });

    test('a different amount for this date is sent as an override', async () => {
      reminders.getPendingReminders.mockResolvedValue([scheduledRem()]);
      await mount();
      await screen.findByText('Electricity');
      await fireEvent.press(screen.getByText('Pay now'));
      await fireEvent.changeText(await screen.findByDisplayValue('5000'), '4,200');
      await fireEvent.press(screen.getByText('Confirm'));
      await waitFor(() => expect(sched.confirmOccurrence).toHaveBeenCalledWith('o1', { amount: 4200 }));
    });

    test('a bad amount is refused before calling the server', async () => {
      const a = alert();
      reminders.getPendingReminders.mockResolvedValue([scheduledRem()]);
      await mount();
      await screen.findByText('Electricity');
      await fireEvent.press(screen.getByText('Pay now'));
      await fireEvent.changeText(await screen.findByDisplayValue('5000'), '0');
      await fireEvent.press(screen.getByText('Confirm'));
      expect(a).toHaveBeenCalled();
      expect(sched.confirmOccurrence).not.toHaveBeenCalled();
      a.mockRestore();
    });

    test('a refused confirm shows the server message and keeps the sheet', async () => {
      const a = alert();
      sched.confirmOccurrence.mockRejectedValue({ response: { data: { message: 'The wallet is archived' } } });
      reminders.getPendingReminders.mockResolvedValue([scheduledRem()]);
      await mount();
      await screen.findByText('Electricity');
      await fireEvent.press(screen.getByText('Pay now'));
      await fireEvent.press(await screen.findByText('Confirm'));
      await waitFor(() => expect(a).toHaveBeenCalled());
      expect(a.mock.calls[0][1]).toBe('The wallet is archived');
      expect(screen.getByText('Confirm payment')).toBeTruthy();
      a.mockRestore();
    });

    test('Open goes to the schedule, not to a debt', async () => {
      reminders.getPendingReminders.mockResolvedValue([scheduledRem()]);
      await mount();
      await screen.findByText('Electricity');
      await fireEvent.press(screen.getByText('Open'));
      expect(router.push).toHaveBeenCalledWith({ pathname: '/(dashboard)/scheduled', params: { id: 's1' } });
    });

    test('Skip this date asks first, then skips that one date', async () => {
      const a = alert();
      reminders.getPendingReminders.mockResolvedValue([scheduledRem()]);
      await mount();
      await screen.findByText('Electricity');
      await fireEvent.press(screen.getByText('Skip this date'));
      expect(a).toHaveBeenCalledTimes(1);
      expect(sched.skipOccurrence).not.toHaveBeenCalled();
      reminders.getPendingReminders.mockResolvedValue([]);
      const buttons = a.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
      await act(async () => { buttons.find(b => b.text === 'Skip this date')!.onPress!(); });
      await waitFor(() => expect(sched.skipOccurrence).toHaveBeenCalledWith('o1'));
      a.mockRestore();
    });

    test('a debt and a scheduled item can wait in the same queue', async () => {
      reminders.getPendingReminders.mockResolvedValue([rem(), scheduledRem()]);
      await mount();
      expect(await screen.findByText('Pay John')).toBeTruthy();
      await fireEvent.press(screen.getByText(/Next/));
      expect(screen.getByText('Electricity')).toBeTruthy();
      expect(screen.getByText('2 of 2')).toBeTruthy();
    });

    test('a server that does not send "source" still shows debt reminders', async () => {
      reminders.getPendingReminders.mockResolvedValue([{ ...rem(), source: undefined } as any]);
      await mount();
      expect(await screen.findByText('Pay John')).toBeTruthy();
    });

    test('an item without a wallet falls back to the main currency instead of crashing', async () => {
      reminders.getPendingReminders.mockResolvedValue([scheduledRem({ currency: '', walletId: null })]);
      await mount();
      expect(await screen.findByText('Electricity')).toBeTruthy();
      expect(screen.getByText(/5,000/)).toBeTruthy();
    });
  });

  test('offline: no crash and nothing shown', async () => {
    reminders.getPendingReminders.mockRejectedValue(new Error('Network Error'));
    await mount();
    await waitFor(() => expect(reminders.getPendingReminders).toHaveBeenCalled());
    expect(screen.queryByTestId('reminder-popup')).toBeNull();
  });
});
