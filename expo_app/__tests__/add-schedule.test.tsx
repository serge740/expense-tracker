import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import AddTransactionScreen from '@/app/(dashboard)/add';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('@/env', () => ({ __esModule: true, default: { UPLOADS_URL: 'http://uploads.test' } }));

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams.current,
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@/services/transaction.service', () => ({ createTransaction: jest.fn() }));
jest.mock('@/services/receipts.service', () => ({ processReceipt: jest.fn() }));
jest.mock('@/services/scheduled.service', () => ({ createScheduled: jest.fn() }));
jest.mock('@/services/wallet.service', () => ({
  getWallets: jest.fn(),
}));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)',
    buttonBg: '#00627F', headerBg: '#00627F', text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9',
    border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));

const tx = require('@/services/transaction.service') as { createTransaction: jest.Mock<(...a: any[]) => Promise<any>> };
const sch = require('@/services/scheduled.service') as { createScheduled: jest.Mock<(...a: any[]) => Promise<any>> };
const walletSvc = require('@/services/wallet.service') as { getWallets: jest.Mock<(...a: any[]) => Promise<any>> };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function mount() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LanguageProvider><AddTransactionScreen /></LanguageProvider>
    </SafeAreaProvider>,
  );
  await waitFor(() => expect(walletSvc.getWallets).toHaveBeenCalled());
}

/** Types an amount, opens the Repeat sheet, picks Weekly and confirms it. */
async function makeItWeekly() {
  await fireEvent.press(screen.getByLabelText(/^Repeat: /));
  await fireEvent.press(await screen.findByText('Weekly'));
  await fireEvent.press(screen.getByText('Done'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.current = {};
  walletSvc.getWallets.mockResolvedValue([{ id: 'w1', name: 'Main', bank: 'Test', currency: 'RWF', balance: 1000, color: 'teal', type: 'CHECKING', archived: false, isDefault: true }]);
  tx.createTransaction.mockResolvedValue({});
  sch.createScheduled.mockResolvedValue({ waiting: [{ id: 'o1', dueAt: '2030-10-22T07:00:00Z' }], nextDueAt: '2030-10-22T07:00:00Z' });
});
afterEach(cleanup);

describe('Add screen: scheduling', () => {
  test('an ordinary transaction shows a Repeat row that says it does not repeat, and no due-time choice', async () => {
    await mount();
    expect(screen.getByText('New transaction')).toBeTruthy();
    expect(screen.getByTestId('repeat-row-text').props.children).toBe('Does not repeat');
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.queryByText('Remind me to confirm')).toBeNull();
  });

  test('an ordinary save still creates a normal transaction, never a schedule', async () => {
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '2500');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(tx.createTransaction).toHaveBeenCalledTimes(1));
    expect(tx.createTransaction.mock.calls[0][0]).toMatchObject({ type: 'EXPENSE', amount: 2500, walletId: 'w1' });
    expect(sch.createScheduled).not.toHaveBeenCalled();
  });

  test('choosing a repeat turns it into a scheduled transaction: title, button, and the due-time choice', async () => {
    await mount();
    await makeItWeekly();
    expect(screen.getByTestId('repeat-row-text').props.children).toMatch(/^Every \w+ at /);
    expect(screen.getByText('New scheduled transaction')).toBeTruthy();
    expect(screen.getByText('Schedule · repeating')).toBeTruthy();
    expect(screen.getByText('Remind me to confirm')).toBeTruthy();
    expect(screen.getByText('Post automatically')).toBeTruthy();
    expect(screen.getByText(/Nothing moves until you confirm/)).toBeTruthy();
  });

  test('saving a repeating one calls the schedule API with the rule, mode and zone, and not the transaction API', async () => {
    const a = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '5000');
    await makeItWeekly();
    await fireEvent.press(screen.getByText('Schedule · repeating'));
    await waitFor(() => expect(sch.createScheduled).toHaveBeenCalledTimes(1));
    const body = sch.createScheduled.mock.calls[0][0];
    expect(body).toMatchObject({ type: 'EXPENSE', amount: 5000, walletId: 'w1', mode: 'REMIND_CONFIRM', repeat: { unit: 'WEEK', every: 1, ends: { type: 'never' } } });
    expect(typeof body.timezone).toBe('string');
    expect(Number.isNaN(Date.parse(body.startAt))).toBe(false);
    expect(tx.createTransaction).not.toHaveBeenCalled();
    await waitFor(() => expect(a).toHaveBeenCalled());
    expect(a.mock.calls[0][0]).toBe('Scheduled');
    a.mockRestore();
  });

  test('"Post automatically" is what gets sent when chosen', async () => {
    const a = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '100');
    await makeItWeekly();
    await fireEvent.press(screen.getByText('Post automatically'));
    expect(screen.getByText(/created for you at the due time/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Schedule · repeating'));
    await waitFor(() => expect(sch.createScheduled).toHaveBeenCalled());
    expect(sch.createScheduled.mock.calls[0][0].mode).toBe('AUTO_POST');
    a.mockRestore();
  });

  test('income stays income when scheduled', async () => {
    const a = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await mount();
    await fireEvent.press(screen.getByText('Income'));
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '200000');
    await makeItWeekly();
    await fireEvent.press(screen.getByText('Schedule · repeating'));
    await waitFor(() => expect(sch.createScheduled).toHaveBeenCalled());
    expect(sch.createScheduled.mock.calls[0][0]).toMatchObject({ type: 'INCOME', amount: 200000 });
    a.mockRestore();
  });

  test('a missing amount is refused before anything is sent', async () => {
    const a = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await mount();
    await makeItWeekly();
    await fireEvent.press(screen.getByText('Schedule · repeating'));
    expect(a).toHaveBeenCalled();
    expect(sch.createScheduled).not.toHaveBeenCalled();
    a.mockRestore();
  });

  test('a server refusal is shown and nothing is claimed as saved', async () => {
    const a = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    sch.createScheduled.mockRejectedValue({ response: { data: { message: 'That wallet is archived' } } });
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '100');
    await makeItWeekly();
    await fireEvent.press(screen.getByText('Schedule · repeating'));
    await waitFor(() => expect(a).toHaveBeenCalled());
    expect(a.mock.calls[0][1]).toBe('That wallet is archived');
    a.mockRestore();
  });

  test('choosing "Never" again puts it back to an ordinary transaction', async () => {
    await mount();
    await makeItWeekly();
    expect(screen.getByText('New scheduled transaction')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/^Repeat: /));
    await fireEvent.press((await screen.findAllByText('Never'))[0]);       // the frequency 'Never' (the end rule has one too)
    await fireEvent.press(screen.getByText('Done'));
    expect(screen.getByText('New transaction')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.queryByText('Remind me to confirm')).toBeNull();
  });

  describe('with a receipt attached', () => {
    test('a schedule cannot keep it, so we ask first instead of dropping it silently', async () => {
      mockParams.current = { receiptUrl: 'receipt.jpg' };
      const a = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await mount();
      await fireEvent.changeText(screen.getByPlaceholderText('0'), '100');
      await makeItWeekly();
      await fireEvent.press(screen.getByText('Schedule · repeating'));
      expect(a).toHaveBeenCalledTimes(1);
      expect(a.mock.calls[0][0]).toBe('Receipt not kept');
      expect(sch.createScheduled).not.toHaveBeenCalled();
      const buttons = a.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
      buttons.find(b => b.text === 'Continue')!.onPress!();
      await waitFor(() => expect(sch.createScheduled).toHaveBeenCalledTimes(1));
      a.mockRestore();
    });

    test('Cancel keeps everything as it was', async () => {
      mockParams.current = { receiptUrl: 'receipt.jpg' };
      const a = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await mount();
      await fireEvent.changeText(screen.getByPlaceholderText('0'), '100');
      await makeItWeekly();
      await fireEvent.press(screen.getByText('Schedule · repeating'));
      const buttons = a.mock.calls[0][2] as Array<{ text: string; style?: string }>;
      expect(buttons.find(b => b.style === 'cancel')).toBeTruthy();
      expect(sch.createScheduled).not.toHaveBeenCalled();
      a.mockRestore();
    });

    test('an ordinary transaction keeps its receipt as before', async () => {
      mockParams.current = { receiptUrl: 'receipt.jpg' };
      await mount();
      await fireEvent.changeText(screen.getByPlaceholderText('0'), '100');
      await fireEvent.press(screen.getByText('Save'));
      await waitFor(() => expect(tx.createTransaction).toHaveBeenCalled());
      expect(tx.createTransaction.mock.calls[0][0].receiptUrl).toBe('receipt.jpg');
    });
  });
});
