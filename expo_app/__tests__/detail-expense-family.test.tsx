import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import TransactionDetailScreen from '@/app/(dashboard)/transaction-detail';
import ExpenseScreen from '@/app/(dashboard)/expense';
import { detailParams } from '@/utils/tx-nav';
import type { Transaction } from '@/services/transaction.service';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockParams: { value: Record<string, string> } = { value: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams.value,
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-media-library', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('@/components/image-viewer-modal', () => ({ ImageViewerModal: () => null }));
jest.mock('@/env', () => ({ __esModule: true, default: { UPLOADS_URL: 'http://uploads.test' } }));
jest.mock('@/services/transaction.service', () => ({
  deleteTransaction: jest.fn(), getTransactions: jest.fn(), CATEGORY_ICON: {}, CATEGORY_LABEL: { food: 'Food' },
}));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', surface: '#FFFFFF', primary: '#5B3FD0', primaryBg: 'rgba(91,63,208,0.1)', buttonBg: '#5B3FD0', headerBg: '#5B3FD0',
    text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9', border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', isDark: false,
  }),
}));
const mockScope: { value: any } = { value: {} };
jest.mock('@/context/scope-context', () => ({ useScope: () => mockScope.value }));

type Fn = jest.Mock<(...a: any[]) => Promise<any>>;
const txSvc = require('@/services/transaction.service') as { deleteTransaction: Fn; getTransactions: Fn };
const { router } = require('expo-router') as { router: { push: jest.Mock; back: jest.Mock } };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}><LanguageProvider>{ui}</LanguageProvider></SafeAreaProvider>);

const MAY: Record<string, (a: string) => boolean> = {
  OWNER: () => true, ADMIN: () => true, MEMBER: a => a === 'tx.add' || a === 'tx.edit.own', VIEWER: () => false,
};
const family = { id: 'fam-12345678', name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' };
const inFamily = (role: string) => ({ ready: true, isFamily: true, scope: 'family', family, role, switchTo: jest.fn(), can: MAY[role] });
const personal = () => ({ ready: true, isFamily: false, scope: 'personal', family: null, role: null, switchTo: jest.fn(), can: () => true });

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1', type: 'EXPENSE', category: 'food', title: 'Groceries', subCategory: null, description: null, amount: -42300, date: '2030-10-20T10:00:00Z',
  walletId: 'fw1', receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null, ...over,
} as Transaction);
const GRACE = { clientId: 'grace', name: 'Grace Uwase', isYou: false };
const ME = { clientId: 'aline', name: 'Aline Uwase', isYou: true };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  txSvc.deleteTransaction.mockResolvedValue({ success: true });
  txSvc.getTransactions.mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });
  mockScope.value = personal();
});
afterEach(cleanup);

describe('detailParams', () => {
  test('carries the row, and the author when there is one', () => {
    expect(detailParams(tx({ author: GRACE }))).toMatchObject({ id: 't1', title: 'Groceries', amount: '-42300', authorId: 'grace', authorName: 'Grace Uwase', authorIsYou: '' });
    expect(detailParams(tx({ author: ME })).authorIsYou).toBe('1');
    expect(detailParams(tx())).toMatchObject({ authorId: '', authorName: '', authorIsYou: '' });
  });
});

describe('Transaction detail', () => {
  test('in Personal: no "Added by", and Delete is there', async () => {
    mockParams.value = detailParams(tx());
    await wrap(<TransactionDetailScreen />);
    expect(screen.queryByText('Added by')).toBeNull();
    expect(screen.getByTestId('detail-delete')).toBeTruthy();
  });

  test('in a family it says who added it, and "you" for your own', async () => {
    mockScope.value = inFamily('MEMBER');
    mockParams.value = detailParams(tx({ author: GRACE }));
    await wrap(<TransactionDetailScreen />);
    expect(screen.getByText('Added by')).toBeTruthy();
    expect(screen.getByText('Grace Uwase')).toBeTruthy();
    await cleanup();
    mockParams.value = detailParams(tx({ author: ME }));
    await wrap(<TransactionDetailScreen />);
    expect(screen.getByText('Aline Uwase (you)')).toBeTruthy();
  });

  test('a Member may delete their own entry, and is stopped (with the reason) on someone else\'s', async () => {
    mockScope.value = inFamily('MEMBER');
    mockParams.value = detailParams(tx({ author: ME }));
    await wrap(<TransactionDetailScreen />);
    expect(screen.getByTestId('detail-delete')).toBeTruthy();
    expect(screen.queryByTestId('detail-not-yours')).toBeNull();
    await cleanup();
    mockParams.value = detailParams(tx({ author: GRACE }));
    await wrap(<TransactionDetailScreen />);
    expect(screen.queryByTestId('detail-delete')).toBeNull();
    expect(screen.getByTestId('detail-not-yours')).toHaveTextContent('Only the owner and admins can change what other people added.');
  });

  test('an Admin or the Owner may delete anyone\'s; a Viewer nobody\'s', async () => {
    mockParams.value = detailParams(tx({ author: GRACE }));
    mockScope.value = inFamily('ADMIN');
    await wrap(<TransactionDetailScreen />);
    expect(screen.getByTestId('detail-delete')).toBeTruthy();
    await cleanup();
    mockScope.value = inFamily('VIEWER');
    mockParams.value = detailParams(tx({ author: ME }));
    await wrap(<TransactionDetailScreen />);
    expect(screen.queryByTestId('detail-delete')).toBeNull();
  });

  test('deleting asks first, deletes, and goes back; a refusal is shown in words', async () => {
    mockScope.value = inFamily('ADMIN');
    mockParams.value = detailParams(tx({ author: GRACE }));
    await wrap(<TransactionDetailScreen />);
    await fireEvent.press(screen.getByTestId('detail-delete'));
    const press = async () => { const b = (Alert.alert as unknown as jest.Mock).mock.calls.at(-1)![2] as Array<{ text: string; onPress?: () => Promise<void> }>; await b.find(x => x.text === 'Delete')!.onPress!(); };
    await press();
    expect(txSvc.deleteTransaction).toHaveBeenCalledWith('t1');
    expect(router.back).toHaveBeenCalled();
    txSvc.deleteTransaction.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 403, data: { code: 'FORBIDDEN_ACTION' } } }));
    await fireEvent.press(screen.getByTestId('detail-delete'));
    await press();
    await waitFor(() => expect((Alert.alert as unknown as jest.Mock).mock.calls.at(-1)![1]).toBe('Your role does not allow this.'));
  });
});

describe('Expenses list', () => {
  const rows = () => ({ data: [tx({ id: 't1', title: 'Groceries', author: GRACE }), tx({ id: 't2', title: 'Fuel', author: ME })], total: 2, page: 1, limit: 50 });

  test('in a family each row says who added it', async () => {
    mockScope.value = inFamily('MEMBER');
    txSvc.getTransactions.mockResolvedValue(rows());
    await wrap(<ExpenseScreen />);
    expect(await screen.findByText(/Food · .* · Grace Uwase/)).toBeTruthy();
    expect(screen.getByText(/Food · .* · you/)).toBeTruthy();
  });
  test('a Viewer has no add button; a Member does', async () => {
    mockScope.value = inFamily('VIEWER');
    txSvc.getTransactions.mockResolvedValue(rows());
    await wrap(<ExpenseScreen />);
    await screen.findByText('Groceries');
    expect(screen.queryByTestId('expense-add')).toBeNull();
    await cleanup();
    mockScope.value = inFamily('MEMBER');
    await wrap(<ExpenseScreen />);
    expect(await screen.findByTestId('expense-add')).toBeTruthy();
  });
  test('a Member can long-press delete their own row only', async () => {
    mockScope.value = inFamily('MEMBER');
    txSvc.getTransactions.mockResolvedValue(rows());
    await wrap(<ExpenseScreen />);
    await fireEvent(await screen.findByText('Fuel'), 'longPress');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    (Alert.alert as unknown as jest.Mock).mockClear();
    await fireEvent(screen.getByText('Groceries'), 'longPress');
    expect(Alert.alert).not.toHaveBeenCalled();
  });
  test('in Personal nothing changes: add button, long-press delete, no author', async () => {
    txSvc.getTransactions.mockResolvedValue({ data: [tx({ title: 'Groceries' })], total: 1, page: 1, limit: 50 });
    await wrap(<ExpenseScreen />);
    await screen.findByText('Groceries');
    expect(screen.getByTestId('expense-add')).toBeTruthy();
    expect(screen.queryByText(/ · you$/)).toBeNull();
    await fireEvent(screen.getByText('Groceries'), 'longPress');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });
});
