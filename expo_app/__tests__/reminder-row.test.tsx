import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { LanguageProvider } from '@/context/language-context';
import { ReminderRow } from '@/components/reminders/reminder-row';
import type { Debt } from '@/services/debt.service';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/services/debt.service', () => ({ updateDebt: jest.fn() }));
jest.mock('@/services/reminder.service', () => ({ wakeReminder: jest.fn() }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)', buttonBg: '#00627F',
    text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9', border: 'rgba(0,98,127,0.12)', inputBg: '#F3F8FA', isDark: false,
  }),
}));

const debtSvc = require('@/services/debt.service') as { updateDebt: jest.Mock<(...a: any[]) => Promise<any>> };
const remSvc = require('@/services/reminder.service') as { wakeReminder: jest.Mock<(...a: any[]) => Promise<any>> };

const debt = (over: Partial<Debt> = {}): Debt => ({
  id: 'd1', kind: 'BORROWED', person: 'John', phone: null, amount: 200000, paid: 50000, writtenOffAmount: 0, remaining: 150000,
  currency: 'RWF', date: '2026-10-12T10:00:00Z', dueDate: null, note: null, walletId: null, principalTransactionId: null,
  status: 'OPEN', archived: false, overdue: false, nextDueAt: null, remindersOn: true, reminderId: 'r1', reminderStatus: 'ACTIVE',
  nextReminderAt: '2030-10-25T16:00:00Z', payments: [], installments: [], ...over,
});

async function mount(d: Debt, onChanged = jest.fn()) {
  await render(<LanguageProvider><ReminderRow debt={d} onChanged={onChanged} /></LanguageProvider>);
  return { onChanged };
}

beforeEach(() => { jest.clearAllMocks(); debtSvc.updateDebt.mockResolvedValue({}); remSvc.wakeReminder.mockResolvedValue({}); });
afterEach(cleanup);

describe('ReminderRow', () => {
  test('on: shows when the next reminder is', async () => {
    await mount(debt());
    expect(screen.getByText('Remind me')).toBeTruthy();
    expect(screen.getByText(/Next reminder:/)).toBeTruthy();
    expect(screen.getByText(/Reminds you 1 day before/)).toBeTruthy();
    expect(screen.queryByText('Wake now')).toBeNull();
  });

  test('off: says there are no reminders and explains', async () => {
    await mount(debt({ remindersOn: false, reminderId: null, reminderStatus: null, nextReminderAt: null }));
    expect(screen.getByText(/Off · no reminders/)).toBeTruthy();
    expect(screen.getByText(/You will not be reminded/)).toBeTruthy();
  });

  test('on but nothing scheduled yet', async () => {
    await mount(debt({ reminderId: null, reminderStatus: null, nextReminderAt: null }));
    expect(screen.getByText('No reminder scheduled')).toBeTruthy();
  });

  test('switching off saves it and reloads', async () => {
    const { onChanged } = await mount(debt());
    await fireEvent(screen.getByLabelText('Remind me'), 'valueChange', false);
    await waitFor(() => expect(debtSvc.updateDebt).toHaveBeenCalledWith('d1', { remindersOn: false }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Off · no reminders/)).toBeTruthy();
  });

  test('a failed save puts the switch back and shows why', async () => {
    const a = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    debtSvc.updateDebt.mockRejectedValue({ response: { data: { message: 'Debt not found' } } });
    const { onChanged } = await mount(debt());
    await fireEvent(screen.getByLabelText('Remind me'), 'valueChange', false);
    await waitFor(() => expect(a).toHaveBeenCalled());
    expect(a.mock.calls[0][1]).toBe('Debt not found');
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByText(/Next reminder:/)).toBeTruthy();   // back to on
    a.mockRestore();
  });

  test('snoozed: shows when it wakes and offers "Wake now"', async () => {
    const { onChanged } = await mount(debt({ reminderStatus: 'SNOOZED' }));
    expect(screen.getByText(/Snoozed until/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Wake now'));
    await waitFor(() => expect(remSvc.wakeReminder).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  test('"Wake now" is not offered when reminders are off', async () => {
    await mount(debt({ remindersOn: false, reminderStatus: 'SNOOZED' }));
    expect(screen.queryByText('Wake now')).toBeNull();
  });
});
