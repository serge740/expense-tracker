import React from 'react';
import { StyleSheet } from 'react-native';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { LanguageProvider } from '@/context/language-context';
import { DebtProgressCard, progressPercent } from '@/components/debt/debt-progress-card';
import { DebtInfo } from '@/components/debt/debt-info';
import { sortForLedger } from '@/utils/debt';
import type { Debt } from '@/services/debt.service';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)', buttonBg: '#00627F',
    text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9', border: 'rgba(0,98,127,0.12)', inputBg: '#F3F8FA', isDark: false,
  }),
}));

const debt = (o: Partial<Debt> = {}): Debt => ({
  id: 'd1', kind: 'BORROWED', person: 'John Mugisha', phone: '+250788123456', amount: 200000, paid: 80000, writtenOffAmount: 0, remaining: 120000,
  currency: 'RWF', date: '2030-10-12T10:00:00Z', dueDate: '2030-11-02T09:00:00Z', note: 'For school fees', walletId: null, principalTransactionId: 'p1',
  status: 'OPEN', archived: false, overdue: false, nextDueAt: '2030-10-25T09:00:00Z', remindersOn: true, reminderId: 'r1', reminderStatus: 'ACTIVE',
  nextReminderAt: '2030-10-24T09:00:00Z', payments: [], installments: [], ...o,
});
const fillWidth = () => (StyleSheet.flatten(screen.getByTestId('debt-progress-fill').props.style) as { width: string }).width;
const wrap = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);
afterEach(cleanup);

describe('progressPercent', () => {
  test('paid over total', () => expect(progressPercent(debt())).toBe(40));
  test('forgiven counts as cleared', () => expect(progressPercent(debt({ paid: 50000, writtenOffAmount: 50000 }))).toBe(50));
  test('nothing paid is 0, everything paid is 100', () => {
    expect(progressPercent(debt({ paid: 0 }))).toBe(0);
    expect(progressPercent(debt({ paid: 200000 }))).toBe(100);
  });
  test('never outside 0…100, and a zero amount does not divide by zero', () => {
    expect(progressPercent(debt({ paid: 999999 }))).toBe(100);
    expect(progressPercent(debt({ amount: 0, paid: 0 }))).toBe(0);
  });
});

describe('DebtProgressCard', () => {
  test('shows who, the total, and a bar with what is paid and what is left', async () => {
    await wrap(<DebtProgressCard debt={debt()} hidden={false} onPress={() => {}} />);
    expect(screen.getByText('John Mugisha')).toBeTruthy();
    expect(screen.getByText('For school fees')).toBeTruthy();
    expect(screen.getByText(/200,000/)).toBeTruthy();
    expect(screen.getByText(/^Paid .*80,000/)).toBeTruthy();
    expect(screen.getByText(/^Left .*120,000/)).toBeTruthy();
    expect(fillWidth()).toBe('40%');
  });
  test('a credit says "Received", not "Paid"', async () => {
    await wrap(<DebtProgressCard debt={debt({ kind: 'LENT', paid: 40000, remaining: 160000 })} hidden={false} onPress={() => {}} />);
    expect(screen.getByText(/^Received .*40,000/)).toBeTruthy();
    expect(screen.queryByText(/^Paid /)).toBeNull();
  });
  test('without a note it shows the phone instead', async () => {
    await wrap(<DebtProgressCard debt={debt({ note: null })} hidden={false} onPress={() => {}} />);
    expect(screen.getByText('+250788123456')).toBeTruthy();
  });
  test('without a note or a phone it shows when it started', async () => {
    await wrap(<DebtProgressCard debt={debt({ note: null, phone: null })} hidden={false} onPress={() => {}} />);
    expect(screen.getByText(/^Since /)).toBeTruthy();
  });
  test('an overdue one is flagged', async () => {
    await wrap(<DebtProgressCard debt={debt({ overdue: true })} hidden={false} onPress={() => {}} />);
    expect(screen.getByText('Overdue')).toBeTruthy();
  });
  test('closed ones say how they ended, and show no next date', async () => {
    await wrap(<DebtProgressCard debt={debt({ status: 'SETTLED', paid: 200000, remaining: 0 })} hidden={false} onPress={() => {}} />);
    expect(screen.getByText('Settled')).toBeTruthy();
    expect(screen.queryByText(/^next /)).toBeNull();
  });
  test('a forgiven one is full and says Forgiven, not Settled', async () => {
    await wrap(<DebtProgressCard debt={debt({ status: 'FORGIVEN', paid: 150000, writtenOffAmount: 50000, remaining: 0 })} hidden={false} onPress={() => {}} />);
    expect(screen.getByText('Forgiven')).toBeTruthy();
    expect(screen.queryByText('Settled')).toBeNull();
    expect(fillWidth()).toBe('100%');
  });
  test('an open one shows its next pay date', async () => {
    await wrap(<DebtProgressCard debt={debt()} hidden={false} onPress={() => {}} />);
    expect(screen.getByText(/^next /)).toBeTruthy();
  });
  test('amounts are hidden when balances are hidden', async () => {
    await wrap(<DebtProgressCard debt={debt()} hidden onPress={() => {}} />);
    expect(screen.queryByText(/200,000/)).toBeNull();
    expect(screen.getAllByText(/••••/).length).toBeGreaterThan(0);
  });
  test('tapping it opens that debt', async () => {
    const onPress = jest.fn();
    await wrap(<DebtProgressCard debt={debt()} hidden={false} onPress={onPress} />);
    await fireEvent.press(screen.getByTestId('debt-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('DebtInfo', () => {
  test('lists every detail of an open debt, including the next pay date and the next reminder', async () => {
    await wrap(<DebtInfo debt={debt()} hidden={false} />);
    for (const label of ['DETAILS', 'Total', 'Paid', 'Left', 'Started', 'Next pay date', 'Final pay date', 'Next reminder', 'Phone', 'Note']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('+250788123456')).toBeTruthy();
    expect(screen.getByText('For school fees')).toBeTruthy();
    expect(screen.queryByText('Forgiven')).toBeNull();
  });
  test('says the reminders are off when they are', async () => {
    await wrap(<DebtInfo debt={debt({ remindersOn: false, nextReminderAt: null })} hidden={false} />);
    expect(screen.getByText('Off')).toBeTruthy();
  });
  test('"None" when there is no pay date or reminder yet', async () => {
    await wrap(<DebtInfo debt={debt({ nextDueAt: null, nextReminderAt: null, dueDate: null })} hidden={false} />);
    expect(screen.getAllByText('None')).toHaveLength(2);
  });
  test('a credit says "Received"', async () => {
    await wrap(<DebtInfo debt={debt({ kind: 'LENT' })} hidden={false} />);
    expect(screen.getByText('Received')).toBeTruthy();
    expect(screen.queryByText('Paid')).toBeNull();
  });
  test('shows what was forgiven, only when something was', async () => {
    await wrap(<DebtInfo debt={debt({ writtenOffAmount: 20000, remaining: 100000 })} hidden={false} />);
    expect(screen.getByText('Forgiven')).toBeTruthy();
  });
  test('a closed debt shows no pay-date or reminder rows', async () => {
    await wrap(<DebtInfo debt={debt({ status: 'SETTLED', remaining: 0 })} hidden={false} />);
    expect(screen.queryByText('Next pay date')).toBeNull();
    expect(screen.queryByText('Next reminder')).toBeNull();
    expect(screen.getByText('Started')).toBeTruthy();
  });
  test('phone and note are left out when empty', async () => {
    await wrap(<DebtInfo debt={debt({ phone: null, note: null })} hidden={false} />);
    expect(screen.queryByText('Phone')).toBeNull();
    expect(screen.queryByText('Note')).toBeNull();
  });
  test('the final date is not repeated when it is the same as the next one', async () => {
    await wrap(<DebtInfo debt={debt({ dueDate: '2030-10-25T09:00:00Z' })} hidden={false} />);
    expect(screen.queryByText('Final pay date')).toBeNull();
  });
  test('amounts are hidden when balances are hidden', async () => {
    await wrap(<DebtInfo debt={debt()} hidden />);
    expect(screen.queryByText(/200,000/)).toBeNull();
  });
});

describe('sortForLedger', () => {
  const d = (id: string, o: Partial<Debt>) => debt({ id, person: id, ...o });
  test('overdue first, then the soonest pay date, then the ones without a date, then closed (newest first)', () => {
    const list = [
      d('closedOld', { status: 'SETTLED', date: '2030-01-01T00:00:00Z' }),
      d('later', { nextDueAt: '2030-12-01T00:00:00Z' }),
      d('noDate', { nextDueAt: null, dueDate: null }),
      d('soon', { nextDueAt: '2030-11-01T00:00:00Z' }),
      d('late', { overdue: true, nextDueAt: '2030-10-01T00:00:00Z' }),
      d('closedNew', { status: 'FORGIVEN', date: '2030-06-01T00:00:00Z' }),
    ];
    expect(sortForLedger(list).map(x => x.id)).toEqual(['late', 'soon', 'later', 'noDate', 'closedNew', 'closedOld']);
  });
  test('does not change the original list', () => {
    const list = [d('b', { nextDueAt: '2030-12-01T00:00:00Z' }), d('a', { nextDueAt: '2030-11-01T00:00:00Z' })];
    sortForLedger(list);
    expect(list.map(x => x.id)).toEqual(['b', 'a']);
  });
});
