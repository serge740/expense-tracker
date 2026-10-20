import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import { PayDates } from '@/components/debt/pay-dates';
import type { Debt, DebtInstallment, InstallmentView } from '@/services/debt.service';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/services/debt.service', () => ({
  addInstallment: jest.fn(),
  moveInstallment: jest.fn(),
  skipInstallment: jest.fn(),
}));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)',
    buttonBg: '#00627F', headerBg: '#00627F', text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9',
    border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));

const service = require('@/services/debt.service') as {
  skipInstallment: jest.Mock<(...a: unknown[]) => Promise<unknown>>;
};

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const inst = (id: string, dueAt: string, view: InstallmentView, plannedAmount: number | null = 100000, extra: Partial<DebtInstallment> = {}): DebtInstallment => ({
  id, dueAt, view, plannedAmount, status: view === 'MOVED' ? 'MOVED' : view === 'SKIPPED' ? 'SKIPPED' : 'PENDING',
  covered: 0, movedFromId: null, note: null, ...extra,
});

const debt = (over: Partial<Debt> = {}): Debt => ({
  id: 'd1', kind: 'BORROWED', person: 'John', phone: null, amount: 200000, paid: 100000, writtenOffAmount: 0, remaining: 100000,
  currency: 'RWF', date: '2026-10-12T10:00:00Z', dueDate: '2026-11-02T09:00:00Z', note: null, walletId: null,
  principalTransactionId: null, status: 'OPEN', archived: false, overdue: false, nextDueAt: '2026-10-25T09:00:00Z',
  remindersOn: true, reminderId: null, reminderStatus: null, nextReminderAt: null,
  payments: [],
  installments: [
    inst('a', '2026-10-15T18:00:00Z', 'PAID'),
    inst('m', '2026-10-25T09:00:00Z', 'MOVED'),
    inst('b', '2026-11-02T09:00:00Z', 'UPCOMING', 100000, { movedFromId: 'm' }),
  ],
  ...over,
});

async function mount(d: Debt, onChanged = jest.fn()) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LanguageProvider><PayDates debt={d} hidden={false} onChanged={onChanged} /></LanguageProvider>
    </SafeAreaProvider>,
  );
  return { onChanged };
}

beforeEach(() => { jest.clearAllMocks(); });
afterEach(cleanup);

describe('PayDates', () => {
  test('lists active pay dates oldest first and hides history by default', async () => {
    await mount(debt());
    expect(screen.getByText('Pay dates')).toBeTruthy();
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.getByText('Upcoming')).toBeTruthy();
    expect(screen.queryByText('Moved')).toBeNull();
  });

  test('"Show history" reveals the moved date and toggles back', async () => {
    await mount(debt());
    await fireEvent.press(screen.getByText('Show history'));
    expect(screen.getByText('Moved')).toBeTruthy();
    expect(screen.getByText('Hide history')).toBeTruthy();
    await fireEvent.press(screen.getByText('Hide history'));
    expect(screen.queryByText('Moved')).toBeNull();
  });

  test('the history link is absent when nothing was moved or skipped', async () => {
    await mount(debt({ installments: [inst('a', '2026-10-15T18:00:00Z', 'PAID'), inst('b', '2026-11-02T09:00:00Z', 'UPCOMING')] }));
    expect(screen.queryByText('Show history')).toBeNull();
  });

  test('only the unpaid date offers Move and Skip', async () => {
    await mount(debt());
    expect(screen.getAllByText('Move')).toHaveLength(1);
    expect(screen.getAllByText('Skip')).toHaveLength(1);
  });

  test('an overdue date is labelled and can be changed', async () => {
    await mount(debt({ overdue: true, installments: [inst('a', '2026-10-01T18:00:00Z', 'OVERDUE')] }));
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByText('Move')).toBeTruthy();
  });

  test('a partly covered date shows how much is covered', async () => {
    await mount(debt({ installments: [inst('a', '2026-12-01T18:00:00Z', 'PARTIAL', 100000, { covered: 25000 })] }));
    expect(screen.getByText('Partly paid')).toBeTruthy();
    expect(screen.getByText(/covered/)).toBeTruthy();
  });

  test('a date without an amount says it is "the rest"', async () => {
    await mount(debt({ installments: [inst('a', '2026-12-01T18:00:00Z', 'UPCOMING', null)] }));
    expect(screen.getByText(/The rest/)).toBeTruthy();
  });

  test('skipping asks first, then calls the server and reloads', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    service.skipInstallment.mockResolvedValue({});
    const { onChanged } = await mount(debt());
    await fireEvent.press(screen.getByText('Skip'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(service.skipInstallment).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => { buttons.find(b => b.text === 'Skip')!.onPress!(); });
    await waitFor(() => expect(service.skipInstallment).toHaveBeenCalledWith('d1', 'b'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    alert.mockRestore();
  });

  test('a failed skip shows the server message and does not reload', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    service.skipInstallment.mockRejectedValue({ response: { data: { message: 'That pay date is already paid' } } });
    const { onChanged } = await mount(debt());
    await fireEvent.press(screen.getByText('Skip'));
    const btns = alert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => { btns.find(b => b.text === 'Skip')!.onPress!(); });
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(2));
    expect(alert.mock.calls[1][1]).toBe('That pay date is already paid');
    expect(onChanged).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  test('a closed debt cannot be changed and says so', async () => {
    await mount(debt({ status: 'SETTLED', remaining: 0, installments: [] }));
    expect(screen.getByText('Nothing left to pay.')).toBeTruthy();
    expect(screen.queryByText('Add pay date')).toBeNull();
  });

  test('an archived debt keeps its dates read-only', async () => {
    await mount(debt({ archived: true }));
    expect(screen.queryByText('Add pay date')).toBeNull();
    expect(screen.queryByText('Move')).toBeNull();
    expect(screen.queryByText('Skip')).toBeNull();
  });

  test('an open debt with no dates invites you to add one', async () => {
    await mount(debt({ installments: [] }));
    expect(screen.getByText('No pay dates yet. Add one so you get reminded.')).toBeTruthy();
    expect(screen.getByText('Add pay date')).toBeTruthy();
  });

  test('"Add pay date" opens the sheet with date and planned amount', async () => {
    await mount(debt());
    await fireEvent.press(screen.getByText('Add pay date'));
    expect(await screen.findByText('Planned amount (optional)')).toBeTruthy();
    expect(screen.getByText('Earlier pay dates are kept. This one is added after them.')).toBeTruthy();
  });

  test('"Move" opens the sheet without an amount field and explains the history', async () => {
    await mount(debt());
    await fireEvent.press(screen.getByText('Move'));
    expect(await screen.findByText('Move pay date')).toBeTruthy();
    expect(screen.queryByText('Planned amount (optional)')).toBeNull();
    expect(screen.getByText(/stays in the history/)).toBeTruthy();
  });
});
