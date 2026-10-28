import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import HistoryScreen from '@/app/(dashboard)/history';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams.current,
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@/components/fade-in-view', () => ({ FadeInView: ({ children }: any) => children }));
jest.mock('@/services/transaction.service', () => ({ getTransactionHistory: jest.fn(), deleteTransaction: jest.fn(), CATEGORY_ICON: {} }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)',
    buttonBg: '#00627F', headerBg: '#00627F', text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9',
    border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));

const history = (require('@/services/transaction.service') as { getTransactionHistory: jest.Mock<(...a: any[]) => Promise<any>> }).getTransactionHistory;
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function mount() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LanguageProvider><HistoryScreen /></LanguageProvider>
    </SafeAreaProvider>,
  );
}
const lastQuery = () => history.mock.calls.at(-1)![0] as Record<string, unknown>;

beforeEach(() => { jest.clearAllMocks(); mockParams.current = {}; history.mockResolvedValue([]); });
afterEach(cleanup);

describe('History with the Home filter', () => {
  test('without a filter it asks for everything, as before', async () => {
    await mount();
    await waitFor(() => expect(history).toHaveBeenCalled());
    expect(lastQuery().view).toBeUndefined();
    expect(lastQuery().includeLoans).toBeUndefined();
  });

  test('opened from Home\'s "See all" on the Debt chip, it asks for debts', async () => {
    mockParams.current = { view: 'debt', includeLoans: 'true' };
    await mount();
    await waitFor(() => expect(lastQuery().view).toBe('debt'));
    expect(screen.getByRole('button', { name: 'Loan', selected: true })).toBeTruthy();
  });

  test('the loans choice carries over', async () => {
    mockParams.current = { view: 'expense', includeLoans: 'false' };
    await mount();
    await waitFor(() => expect(lastQuery()).toMatchObject({ view: 'expense', includeLoans: 'false' }));
  });

  test('changing the chip in History reloads with the new filter', async () => {
    await mount();
    await waitFor(() => expect(history).toHaveBeenCalled());
    await fireEvent.press(screen.getByText('Debt'));
    await waitFor(() => expect(lastQuery().view).toBe('credit'));
    await fireEvent.press(screen.getAllByText('All')[0]);      // the kind chip row is the first one (the category row has an All too)
    await waitFor(() => expect(lastQuery().view).toBeUndefined());
  });

  test('a made-up view in a link is ignored', async () => {
    mockParams.current = { view: 'rm -rf' };
    await mount();
    await waitFor(() => expect(history).toHaveBeenCalled());
    expect(lastQuery().view).toBeUndefined();
    expect(screen.getByRole('button', { name: 'All', selected: true })).toBeTruthy();
  });

  test('the chip combines with the other filters instead of replacing them', async () => {
    mockParams.current = { view: 'credit' };
    await mount();
    await waitFor(() => expect(history).toHaveBeenCalled());
    await fireEvent.press(screen.getByText('Food'));
    await waitFor(() => expect(lastQuery()).toMatchObject({ view: 'credit', category: 'food' }));
  });
});
