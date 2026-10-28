import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import { LoanPlanCard } from '@/components/debt/loan-plan';
import type { Debt, DebtPlan } from '@/services/debt.service';
import { blankRule } from '@/utils/recurrence';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/services/debt.service', () => ({ updateDebt: jest.fn() }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)',
    buttonBg: '#00627F', headerBg: '#00627F', text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9',
    border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));

const { updateDebt } = require('@/services/debt.service') as { updateDebt: jest.Mock<(...a: any[]) => Promise<any>> };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const monthly = { ...blankRule('MONTH'), monthDays: [5] };
const plan = (o: Partial<DebtPlan> = {}): DebtPlan => ({
  amount: 100000, repeat: monthly, startAt: '2030-11-05T09:00:00.000Z', timezone: 'UTC', finishesAt: '2031-02-05T09:00:00.000Z', paymentsLeft: 4, shortfall: 0, ...o,
});
const loan = (o: Partial<Debt> = {}): Debt => ({
  id: 'd1', kind: 'BORROWED', person: 'Bank', phone: null, amount: 400000, paid: 0, writtenOffAmount: 0, remaining: 400000, currency: 'RWF',
  date: '2030-10-12T10:00:00Z', dueDate: '2030-11-05T09:00:00Z', note: null, walletId: null, principalTransactionId: 'p', status: 'OPEN', archived: false,
  overdue: false, nextDueAt: '2030-11-05T09:00:00Z', remindersOn: true, reminderId: null, reminderStatus: null, nextReminderAt: null, payments: [], installments: [], plan: null, ...o,
});

async function show(d: Debt) {
  const onChanged = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LanguageProvider><LoanPlanCard debt={d} hidden={false} onChanged={onChanged} /></LanguageProvider>
    </SafeAreaProvider>,
  );
  return { onChanged };
}

beforeEach(() => { jest.clearAllMocks(); updateDebt.mockResolvedValue({}); });
afterEach(cleanup);

describe('LoanPlanCard: where it shows', () => {
  test('money owed to me, closed loans and archived loans have none', async () => {
    for (const d of [loan({ kind: 'LENT' }), loan({ status: 'SETTLED' }), loan({ archived: true })]) {
      await show(d);
      expect(screen.queryByTestId('plan-add')).toBeNull();
      expect(screen.queryByTestId('plan-card')).toBeNull();
      await cleanup();
    }
  });

  test('an open loan with no plan offers to set one', async () => {
    await show(loan());
    expect(screen.getByText('Set an estimated payment')).toBeTruthy();
  });
});

describe('LoanPlanCard: a loan with a plan', () => {
  test('shows how much, how often, how many payments are left and when the last one is', async () => {
    await show(loan({ plan: plan() }));
    expect(screen.getByText('FRw 100,000 each time')).toBeTruthy();
    expect(screen.getByText(/5th/)).toBeTruthy();
    expect(screen.getByTestId('plan-progress').props.children.join('')).toMatch(/4 payments left · Last payment around Feb 5, 2031/);
  });

  test('says "1 payment left" for the last one', async () => {
    await show(loan({ plan: plan({ paymentsLeft: 1 }) }));
    expect(screen.getByTestId('plan-progress').props.children.join('')).toMatch(/^1 payment left/);
  });

  test('warns when the repeat stops before the loan is paid off', async () => {
    await show(loan({ plan: plan({ finishesAt: null, shortfall: 200000, paymentsLeft: 2 }) }));
    expect(screen.getByTestId('plan-progress').props.children.join('')).toContain('The repeat stops before the loan is paid off');
  });

  test('Stop asks first, then removes the plan (and nothing else)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { onChanged } = await show(loan({ plan: plan() }));
    await fireEvent.press(screen.getByText('Stop'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(updateDebt).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find(b => b.text === 'Stop')!.onPress!();
    await waitFor(() => expect(updateDebt).toHaveBeenCalledWith('d1', { planAmount: null }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    alert.mockRestore();
  });
});

describe('LoanPlanCard: setting and changing it', () => {
  test('setting one sends the amount, the repeat (monthly to begin with) and the time zone', async () => {
    const { onChanged } = await show(loan());
    await fireEvent.press(screen.getByText('Set an estimated payment'));
    await fireEvent.changeText(screen.getByLabelText('Estimated payment (optional)'), '100,000');
    expect(await screen.findByTestId('plan-summary')).toBeTruthy();
    expect(screen.getByTestId('plan-summary').props.children).toMatch(/About 4 payments/);
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(updateDebt).toHaveBeenCalledTimes(1));
    const [id, body] = updateDebt.mock.calls[0];
    expect(id).toBe('d1');
    expect(body).toMatchObject({ planAmount: 100000, planRepeat: { unit: 'MONTH', every: 1 } });
    expect(typeof body.planTimezone).toBe('string');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  test('an amount above the loan is refused, with the reason on screen, and nothing is sent', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await show(loan());
    await fireEvent.press(screen.getByText('Set an estimated payment'));
    await fireEvent.changeText(screen.getByLabelText('Estimated payment (optional)'), '500000');
    expect(screen.getByTestId('plan-error')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));
    expect(alert).toHaveBeenCalled();
    expect(updateDebt).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  test('editing starts from the saved values, and Cancel changes nothing', async () => {
    await show(loan({ plan: plan() }));
    await fireEvent.press(screen.getByText('Edit'));
    expect(screen.getByLabelText('Estimated payment (optional)').props.value).toBe('100000');
    await fireEvent.press(screen.getByText('Cancel'));
    expect(updateDebt).not.toHaveBeenCalled();
    expect(screen.getByTestId('plan-card')).toBeTruthy();
  });

  test('a server refusal is shown, not swallowed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    updateDebt.mockRejectedValueOnce({ response: { data: { message: 'The estimated payment cannot be more than the loan' } } });
    await show(loan());
    await fireEvent.press(screen.getByText('Set an estimated payment'));
    await fireEvent.changeText(screen.getByLabelText('Estimated payment (optional)'), '1000');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Error', 'The estimated payment cannot be more than the loan'));
    alert.mockRestore();
  });
});
