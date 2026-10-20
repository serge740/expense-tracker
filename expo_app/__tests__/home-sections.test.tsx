import React from 'react';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { LanguageProvider } from '@/context/language-context';
import { DebtCreditCards, FeedChips, LoansBar, NeedsAttention, NetWorthRows } from '@/components/home/home-sections';
import type { AttentionItem, DebtBucket, HomeSummary, NetWorth } from '@/services/home.service';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)', buttonBg: '#00627F',
    text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9', border: 'rgba(0,98,127,0.12)', inputBg: '#F3F8FA', isDark: false,
  }),
}));

const wrap = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);
afterEach(cleanup);

const bucket = (o: Partial<DebtBucket> = {}): DebtBucket => ({ amount: 150000, count: 2, overdue: 0, nextDueAt: '2030-11-03T10:00:00Z', ...o });
const none: HomeSummary['scheduled'] = { waiting: 0, next: null };

describe('LoansBar', () => {
  const loans = { out: 170000, in: 40000, borrowed: 200000 };
  test('with loans on, says what is in the figures and that borrowed money is not income', async () => {
    await wrap(<LoansBar loans={loans} includeLoans onToggle={() => {}} />);
    expect(screen.getByText('Loans in these figures: spent 170,000 · received 40,000')).toBeTruthy();
    expect(screen.getByText('Borrowed 200,000 is never income')).toBeTruthy();
  });
  test('with loans off, says what was left out', async () => {
    await wrap(<LoansBar loans={loans} includeLoans={false} onToggle={() => {}} />);
    expect(screen.getByText('Loans left out: 170,000 out · 40,000 in')).toBeTruthy();
  });
  test('says nothing about loans when there were none this month, but the switch is still there', async () => {
    await wrap(<LoansBar loans={{ out: 0, in: 0, borrowed: 0 }} includeLoans onToggle={() => {}} />);
    expect(screen.queryByText(/Loans in these figures/)).toBeNull();
    expect(screen.getByLabelText('Include loans')).toBeTruthy();
  });
  test('no "borrowed" note when nothing was borrowed', async () => {
    await wrap(<LoansBar loans={{ out: 100, in: 0, borrowed: 0 }} includeLoans onToggle={() => {}} />);
    expect(screen.queryByText(/never income/)).toBeNull();
  });
  test('the switch reports its new value', async () => {
    const onToggle = jest.fn();
    await wrap(<LoansBar loans={loans} includeLoans onToggle={onToggle} />);
    await fireEvent(screen.getByLabelText('Include loans'), 'valueChange', false);
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});

describe('DebtCreditCards', () => {
  const press = { onOwe: jest.fn(), onOwed: jest.fn(), onScheduled: jest.fn() };
  test('shows nothing at all for a new person (no debts, credits or schedules)', async () => {
    await wrap(<DebtCreditCards owe={{}} owed={{}} scheduled={none} hidden={false} {...press} />);
    expect(screen.queryByTestId('debt-credit-cards')).toBeNull();
  });
  test('one card per currency, never merged, with the open and overdue counts', async () => {
    await wrap(<DebtCreditCards owe={{ RWF: bucket({ overdue: 1 }), USD: bucket({ amount: 50, count: 1 }) }} owed={{ RWF: bucket({ amount: 80000, count: 1 }) }} scheduled={none} hidden={false} {...press} />);
    expect(screen.getAllByText('You owe')).toHaveLength(2);
    expect(screen.getByText('Owed to you')).toBeTruthy();
    expect(screen.getByText(/150,000/)).toBeTruthy();
    expect(screen.getByText(/80,000/)).toBeTruthy();
    expect(screen.getByText('2 open · 1 overdue')).toBeTruthy();
    expect(screen.getAllByText(/^1 open · next /)).toHaveLength(2);      // the USD debt and the RWF credit
  });
  test('amounts are hidden when the person hides balances', async () => {
    await wrap(<DebtCreditCards owe={{ RWF: bucket() }} owed={{}} scheduled={none} hidden {...press} />);
    expect(screen.queryByText(/150,000/)).toBeNull();
    expect(screen.getByText(/••••/)).toBeTruthy();
  });
  test('the scheduled card says how many wait and what is next', async () => {
    await wrap(<DebtCreditCards owe={{}} owed={{}} scheduled={{ waiting: 2, next: { id: 's', title: 'Rent', nextDueAt: '2030-10-22T07:00:00Z' } }} hidden={false} {...press} />);
    expect(screen.getByText('2 waiting')).toBeTruthy();
    expect(screen.getByText('next: Rent')).toBeTruthy();
  });
  test('only a next schedule (nothing waiting yet) still shows the card', async () => {
    await wrap(<DebtCreditCards owe={{}} owed={{}} scheduled={{ waiting: 0, next: { id: 's', title: 'Rent', nextDueAt: '2030-10-22T07:00:00Z' } }} hidden={false} {...press} />);
    expect(screen.getByText('Nothing waiting')).toBeTruthy();
  });
  test('each card opens its own place', async () => {
    const p = { onOwe: jest.fn(), onOwed: jest.fn(), onScheduled: jest.fn() };
    await wrap(<DebtCreditCards owe={{ RWF: bucket() }} owed={{ RWF: bucket() }} scheduled={{ waiting: 1, next: null }} hidden={false} {...p} />);
    await fireEvent.press(screen.getByText('You owe'));
    await fireEvent.press(screen.getByText('Owed to you'));
    await fireEvent.press(screen.getByText('Scheduled'));
    expect([p.onOwe.mock.calls.length, p.onOwed.mock.calls.length, p.onScheduled.mock.calls.length]).toEqual([1, 1, 1]);
  });
});

describe('NeedsAttention', () => {
  const debt = (i: number, over: Partial<AttentionItem> = {}): AttentionItem => ({
    source: 'DEBT', debtId: `d${i}`, kind: 'BORROWED', person: `P${i}`, currency: 'RWF', remaining: 1000 * (i + 1), dueAt: '2030-10-21T16:00:00Z', overdue: false, ...over,
  } as AttentionItem);
  const sched = (over: Record<string, unknown> = {}): AttentionItem => ({
    source: 'SCHEDULED', occurrenceId: 'o1', scheduleId: 's1', title: 'Rent', txType: 'EXPENSE', currency: '', remaining: 5000, dueAt: '2030-10-22T07:00:00Z', overdue: false, ...over,
  }) as AttentionItem;

  test('shows nothing when nothing needs you', async () => {
    await wrap(<NeedsAttention items={[]} total={0} hidden={false} fallbackCurrency="RWF" onOpen={() => {}} />);
    expect(screen.queryByText('Needs attention')).toBeNull();
  });
  test('words a debt, a credit and a scheduled payment correctly', async () => {
    await wrap(<NeedsAttention items={[debt(0, { overdue: true }), debt(1, { kind: 'LENT', person: 'Eric' }), sched()]} total={3} hidden={false} fallbackCurrency="RWF" onOpen={() => {}} />);
    expect(screen.getByText('Pay P0')).toBeTruthy();
    expect(screen.getByText('Eric owes you')).toBeTruthy();
    expect(screen.getByText('Rent')).toBeTruthy();
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByText('Pay now')).toBeTruthy();
  });
  test('a scheduled item without a wallet uses the fallback currency, not a blank', async () => {
    await wrap(<NeedsAttention items={[sched()]} total={1} hidden={false} fallbackCurrency="RWF" onOpen={() => {}} />);
    expect(screen.getByText(/5,000/)).toBeTruthy();
  });
  test('shows three, and "See all (n)" reveals the rest, "Show less" folds them back', async () => {
    await wrap(<NeedsAttention items={[0, 1, 2, 3, 4].map(i => debt(i))} total={5} hidden={false} fallbackCurrency="RWF" onOpen={() => {}} />);
    expect(screen.getAllByTestId('attention-row')).toHaveLength(3);
    await fireEvent.press(screen.getByText('See all (5)'));
    expect(screen.getAllByTestId('attention-row')).toHaveLength(5);
    await fireEvent.press(screen.getByText('Show less'));
    expect(screen.getAllByTestId('attention-row')).toHaveLength(3);
  });
  test('no "See all" link when everything already fits', async () => {
    await wrap(<NeedsAttention items={[debt(0), debt(1)]} total={2} hidden={false} fallbackCurrency="RWF" onOpen={() => {}} />);
    expect(screen.queryByText(/See all/)).toBeNull();
  });
  test('tapping a row hands back exactly that item', async () => {
    const onOpen = jest.fn();
    const items = [debt(0), sched()];
    await wrap(<NeedsAttention items={items} total={2} hidden={false} fallbackCurrency="RWF" onOpen={onOpen} />);
    await fireEvent.press(screen.getByText('Rent'));
    expect(onOpen).toHaveBeenCalledWith(items[1]);
  });
  test('amounts hidden when balances are hidden', async () => {
    await wrap(<NeedsAttention items={[debt(0)]} total={1} hidden fallbackCurrency="RWF" onOpen={() => {}} />);
    expect(screen.getByText(/••••/)).toBeTruthy();
  });
});

describe('NetWorthRows', () => {
  const nw = (o: Partial<NetWorth> = {}): NetWorth => ({ currency: 'RWF', wallets: 1470000, owed: 80000, owe: 150000, total: 1400000, ...o });
  test('hidden for someone with no debts or credits (it would only repeat their balance)', async () => {
    await wrap(<NetWorthRows netWorth={[nw({ owed: 0, owe: 0, total: 1470000 })]} hidden={false} />);
    expect(screen.queryByTestId('net-worth-row')).toBeNull();
  });
  test('one row per currency with debts, each with its own total', async () => {
    await wrap(<NetWorthRows netWorth={[nw(), nw({ currency: 'USD', wallets: 0, owed: 0, owe: 50, total: -50 })]} hidden={false} />);
    expect(screen.getAllByTestId('net-worth-row')).toHaveLength(2);
    expect(screen.getByText('NET WORTH · RWF')).toBeTruthy();
    expect(screen.getByText('NET WORTH · USD')).toBeTruthy();
  });
  test('tapping shows how the number is made, and tapping again hides it', async () => {
    await wrap(<NetWorthRows netWorth={[nw()]} hidden={false} />);
    expect(screen.queryByTestId('net-worth-detail')).toBeNull();
    await fireEvent.press(screen.getByTestId('net-worth-row'));
    expect(screen.getByTestId('net-worth-detail').props.children).toMatch(/Wallets .*1,470,000 \+ owed to you .*80,000 − you owe .*150,000/);
    await fireEvent.press(screen.getByTestId('net-worth-row'));
    expect(screen.queryByTestId('net-worth-detail')).toBeNull();
  });
});

describe('FeedChips', () => {
  test('six chips, the chosen one is marked', async () => {
    await wrap(<FeedChips value="debt" onChange={() => {}} />);
    for (const l of ['All', 'Income', 'Expense', 'Debt', 'Credit', 'Scheduled']) expect(screen.getByText(l)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Debt', selected: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'All', selected: true })).toBeNull();
  });
  test('tapping a chip reports it', async () => {
    const onChange = jest.fn();
    await wrap(<FeedChips value="all" onChange={onChange} />);
    await fireEvent.press(screen.getByText('Credit'));
    await fireEvent.press(screen.getByText('Scheduled'));
    expect(onChange.mock.calls).toEqual([['credit'], ['scheduled']]);
  });
});
