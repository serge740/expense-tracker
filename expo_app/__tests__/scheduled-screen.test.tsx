import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import ScheduledScreen from '@/app/(dashboard)/scheduled';
import type { Scheduled, ScheduledDetail, WaitingItem } from '@/services/scheduled.service';
import { blankRule } from '@/utils/recurrence';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams.current,
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@/services/scheduled.service', () => ({
  getScheduledList: jest.fn(), getWaitingDates: jest.fn(), getScheduled: jest.fn(), skipOccurrence: jest.fn(), confirmOccurrence: jest.fn(),
  updateScheduled: jest.fn(), pauseScheduled: jest.fn(), resumeScheduled: jest.fn(), endScheduled: jest.fn(),
}));
jest.mock('@/services/wallet.service', () => ({ getWallets: jest.fn() }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)',
    buttonBg: '#00627F', headerBg: '#00627F', text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9',
    border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));

type Fn = jest.Mock<(...a: any[]) => Promise<any>>;
const svc = require('@/services/scheduled.service') as Record<string, Fn>;
const walletSvc = require('@/services/wallet.service') as { getWallets: Fn };
const { router } = require('expo-router') as { router: { push: jest.Mock; back: jest.Mock } };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

// 2030-10-22 07:00 UTC is Tuesday 9:00 in Kigali.
const START = '2030-10-22T07:00:00Z';
const rent: Scheduled = {
  id: 's1', type: 'EXPENSE', category: 'rent', title: 'Rent', subCategory: null, description: null, amount: 5000, walletId: 'w1', currency: 'RWF',
  startAt: START, timezone: 'Africa/Kigali', repeat: { ...blankRule('WEEK'), weekdays: [2, 5] }, mode: 'REMIND_CONFIRM', status: 'ACTIVE',
  nextDueAt: '2030-10-25T07:00:00Z', waiting: [],
};
const salary: Scheduled = { ...rent, id: 's2', type: 'INCOME', category: 'salary', title: 'Salary', amount: 200000, repeat: { ...blankRule('MONTH'), monthDays: [-1] }, status: 'PAUSED', mode: 'AUTO_POST', nextDueAt: null };
const waitingItem: WaitingItem = {
  id: 'o1', scheduleId: 's1', dueAt: '2030-10-22T07:00:00Z', overdue: true, type: 'EXPENSE', title: 'Rent', amount: 5000, category: 'rent', walletId: 'w1', currency: 'RWF', mode: 'REMIND_CONFIRM',
};
const detail = (over: Partial<ScheduledDetail> = {}): ScheduledDetail => ({
  ...rent, upcoming: ['2030-10-25T07:00:00Z', '2030-10-29T07:00:00Z'],
  history: [{ id: 'h1', dueAt: '2030-10-18T07:00:00Z', status: 'POSTED', failReason: null, transactionId: 't1' }], ...over,
});

async function mount() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LanguageProvider><ScheduledScreen /></LanguageProvider>
    </SafeAreaProvider>,
  );
}
const alertSpy = () => jest.spyOn(Alert, 'alert').mockImplementation(() => {});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.current = {};
  svc.getScheduledList.mockResolvedValue([rent, salary]);
  svc.getWaitingDates.mockResolvedValue([]);
  svc.getScheduled.mockResolvedValue(detail());
  svc.skipOccurrence.mockResolvedValue({});
  svc.confirmOccurrence.mockResolvedValue({});
  svc.updateScheduled.mockResolvedValue(detail());
  svc.pauseScheduled.mockResolvedValue(detail({ status: 'PAUSED' }));
  svc.resumeScheduled.mockResolvedValue(detail());
  svc.endScheduled.mockResolvedValue(detail({ status: 'ENDED' }));
  walletSvc.getWallets.mockResolvedValue([]);
});
afterEach(cleanup);

describe('Scheduled screen', () => {
  test('lists each schedule with its rule in words, paused and auto chips, and the next date', async () => {
    await mount();
    expect(await screen.findByText('Rent')).toBeTruthy();
    expect(screen.getByText('Every Tuesday and Friday at 9:00 AM')).toBeTruthy();   // worked out in the schedule's own zone
    expect(screen.getByText('Salary')).toBeTruthy();
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.getByText('Auto')).toBeTruthy();
    expect(screen.getAllByTestId('schedule-card')).toHaveLength(2);
    expect(screen.getByText(/^Next: /)).toBeTruthy();
  });

  test('income is shown with a plus sign', async () => {
    await mount();
    await screen.findByText('Salary');
    expect(screen.getByText(/^\+/)).toBeTruthy();
  });

  test('an empty list explains how to schedule something', async () => {
    svc.getScheduledList.mockResolvedValue([]);
    await mount();
    expect(await screen.findByText(/Nothing scheduled yet/)).toBeTruthy();
    expect(screen.queryByText('Waiting for you')).toBeNull();
  });

  test('dates waiting for an answer come first, with Pay now and Skip', async () => {
    svc.getWaitingDates.mockResolvedValue([waitingItem]);
    await mount();
    expect(await screen.findByText('Waiting for you')).toBeTruthy();
    expect(screen.getByTestId('waiting-card')).toBeTruthy();
    expect(screen.getByText('Pay now')).toBeTruthy();
  });

  test('Pay now posts the date (nothing overridden unless changed) and reloads', async () => {
    svc.getWaitingDates.mockResolvedValue([waitingItem]);
    await mount();
    await fireEvent.press(await screen.findByText('Pay now'));
    expect(await screen.findByText('Confirm payment')).toBeTruthy();
    svc.getWaitingDates.mockResolvedValue([]);
    await fireEvent.press(screen.getByText('Confirm'));
    await waitFor(() => expect(svc.confirmOccurrence).toHaveBeenCalledWith('o1', {}));
    await waitFor(() => expect(screen.queryByTestId('waiting-card')).toBeNull());
  });

  test('income waiting for you says "Mark received"', async () => {
    svc.getWaitingDates.mockResolvedValue([{ ...waitingItem, type: 'INCOME', title: 'Salary' }]);
    await mount();
    expect(await screen.findByText('Mark received')).toBeTruthy();
  });

  test('Skip asks first and then skips only that date', async () => {
    const a = alertSpy();
    svc.getWaitingDates.mockResolvedValue([waitingItem]);
    await mount();
    await fireEvent.press((await screen.findAllByText('Skip this date'))[0]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(svc.skipOccurrence).not.toHaveBeenCalled();
    const buttons = a.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => { buttons.find(b => b.text === 'Skip this date')!.onPress!(); });
    await waitFor(() => expect(svc.skipOccurrence).toHaveBeenCalledWith('o1'));
    a.mockRestore();
  });

  test('a failed skip tells you why', async () => {
    const a = alertSpy();
    svc.skipOccurrence.mockRejectedValue({ response: { data: { message: 'This date was already handled' } } });
    svc.getWaitingDates.mockResolvedValue([waitingItem]);
    await mount();
    await fireEvent.press((await screen.findAllByText('Skip this date'))[0]);
    const buttons = a.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => { buttons.find(b => b.text === 'Skip this date')!.onPress!(); });
    await waitFor(() => expect(a).toHaveBeenCalledTimes(2));
    expect(a.mock.calls[1][1]).toBe('This date was already handled');
    a.mockRestore();
  });

  test('offline: no crash, just empty', async () => {
    svc.getScheduledList.mockRejectedValue(new Error('Network Error'));
    svc.getWaitingDates.mockRejectedValue(new Error('Network Error'));
    await mount();
    expect(await screen.findByText(/Nothing scheduled yet/)).toBeTruthy();
  });

  test('opens a schedule straight away when a push or the inbox points at it', async () => {
    mockParams.current = { id: 's1' };
    await mount();
    await waitFor(() => expect(svc.getScheduled).toHaveBeenCalledWith('s1'));
    expect(await screen.findByTestId('schedule-rule')).toBeTruthy();
  });

  test('the + button goes to the Add screen', async () => {
    await mount();
    await fireEvent.press(await screen.findByLabelText('New scheduled transaction'));
    expect(router.push).toHaveBeenCalledWith('/(dashboard)/add');
  });
});

describe('Schedule detail', () => {
  async function open(d: ScheduledDetail = detail()) {
    svc.getScheduled.mockResolvedValue(d);
    await mount();
    await fireEvent.press((await screen.findAllByTestId('schedule-card'))[0]);
    await screen.findByTestId('schedule-rule');
  }

  test('shows the rule in words, the next dates and the history', async () => {
    await open();
    expect(screen.getByTestId('schedule-rule').props.children).toBe('Every Tuesday and Friday at 9:00 AM');
    expect(screen.getAllByTestId('schedule-upcoming')).toHaveLength(2);
    expect(screen.getByText('Posted')).toBeTruthy();
  });

  test('Pause pauses it and reloads', async () => {
    await open();
    await fireEvent.press(screen.getByText('Pause'));
    await waitFor(() => expect(svc.pauseScheduled).toHaveBeenCalledWith('s1'));
  });

  test('a paused one offers Resume and explains that nothing is caught up', async () => {
    await open(detail({ status: 'PAUSED', upcoming: [] }));
    expect(screen.getByText(/missed dates are not caught up/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Resume'));
    await waitFor(() => expect(svc.resumeScheduled).toHaveBeenCalledWith('s1'));
  });

  test('End asks first, and says what stays', async () => {
    const a = alertSpy();
    await open();
    await fireEvent.press(screen.getByText('End'));
    expect(a).toHaveBeenCalledTimes(1);
    expect(a.mock.calls[0][1]).toMatch(/already posted stays/);
    expect(svc.endScheduled).not.toHaveBeenCalled();
    const buttons = a.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => { buttons.find(b => b.text === 'End')!.onPress!(); });
    await waitFor(() => expect(svc.endScheduled).toHaveBeenCalledWith('s1'));
    a.mockRestore();
  });

  test('an ended schedule is read-only', async () => {
    await open(detail({ status: 'ENDED', upcoming: [] }));
    expect(screen.getByText('Ended')).toBeTruthy();
    expect(screen.queryByText('Pause')).toBeNull();
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('End')).toBeNull();
  });

  test('editing only the amount sends only the amount (so the dates are not rebuilt)', async () => {
    await open();
    await fireEvent.press(screen.getByText('Edit'));
    await fireEvent.changeText(await screen.findByDisplayValue('5000'), '7,500');
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => expect(svc.updateScheduled).toHaveBeenCalledTimes(1));
    expect(svc.updateScheduled).toHaveBeenCalledWith('s1', { amount: 7500 });
  });

  test('editing the title and the mode sends exactly those', async () => {
    await open();
    await fireEvent.press(screen.getByText('Edit'));
    await fireEvent.changeText(await screen.findByDisplayValue('Rent'), 'Flat rent');
    await fireEvent.press(screen.getByText('Post automatically'));
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => expect(svc.updateScheduled).toHaveBeenCalledWith('s1', { title: 'Flat rent', mode: 'AUTO_POST' }));
  });

  test('saving without changing anything does not call the server', async () => {
    await open();
    await fireEvent.press(screen.getByText('Edit'));
    await fireEvent.press(await screen.findByText('Save changes'));
    expect(svc.updateScheduled).not.toHaveBeenCalled();
    expect(screen.getByTestId('schedule-rule')).toBeTruthy();   // back to the read-only view
  });

  test('a bad amount is refused locally', async () => {
    const a = alertSpy();
    await open();
    await fireEvent.press(screen.getByText('Edit'));
    await fireEvent.changeText(await screen.findByDisplayValue('5000'), '0');
    await fireEvent.press(screen.getByText('Save changes'));
    expect(a).toHaveBeenCalled();
    expect(svc.updateScheduled).not.toHaveBeenCalled();
    a.mockRestore();
  });

  test('a refused edit shows the server message', async () => {
    const a = alertSpy();
    svc.updateScheduled.mockRejectedValue({ response: { data: { message: 'That wallet is archived' } } });
    await open();
    await fireEvent.press(screen.getByText('Edit'));
    await fireEvent.changeText(await screen.findByDisplayValue('5000'), '6000');
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => expect(a).toHaveBeenCalled());
    expect(a.mock.calls[0][1]).toBe('That wallet is archived');
    a.mockRestore();
  });

  test('a failed date shows why and can be retried', async () => {
    await open(detail({ history: [{ id: 'h9', dueAt: '2030-10-18T07:00:00Z', status: 'FAILED', failReason: 'The wallet is archived', transactionId: null }] }));
    expect(screen.getByText('Why: The wallet is archived')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(svc.confirmOccurrence).toHaveBeenCalledWith('h9'));
  });

  test('no retry button on an ended schedule', async () => {
    await open(detail({ status: 'ENDED', history: [{ id: 'h9', dueAt: '2030-10-18T07:00:00Z', status: 'FAILED', failReason: 'x', transactionId: null }] }));
    expect(screen.queryByText('Try again')).toBeNull();
  });

  test('an empty history says so', async () => {
    await open(detail({ history: [] }));
    expect(screen.getByText('Nothing posted yet.')).toBeTruthy();
  });
});
