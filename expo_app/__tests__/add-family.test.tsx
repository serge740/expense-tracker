import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import AddTransactionScreen from '@/app/(dashboard)/add';
import type { Wallet } from '@/services/wallet.service';
import type { Debt } from '@/services/debt.service';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('@/env', () => ({ __esModule: true, default: { UPLOADS_URL: 'http://uploads.test' } }));
const mockRouter = { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), replace: jest.fn(), canGoBack: () => true };
const mockParams: { value: Record<string, string> } = { value: {} };
jest.mock('expo-router', () => ({
  get router() { return mockRouter; },
  useLocalSearchParams: () => mockParams.value,
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@/services/transaction.service', () => ({ createTransaction: jest.fn() }));
jest.mock('@/services/receipts.service', () => ({ processReceipt: jest.fn() }));
jest.mock('@/services/scheduled.service', () => ({ createScheduled: jest.fn() }));
jest.mock('@/services/wallet.service', () => ({ getWallets: jest.fn() }));
jest.mock('@/services/debt.service', () => ({ getDebts: jest.fn() }));
jest.mock('@/services/subcategory.service', () => ({ getMySubCategories: jest.fn(async () => []), removeMySubCategory: jest.fn() }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#5B3FD0', primaryBg: 'rgba(91,63,208,0.1)',
    buttonBg: '#5B3FD0', headerBg: '#5B3FD0', text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9',
    border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));
const mockScope: { value: any } = { value: {} };
jest.mock('@/context/scope-context', () => ({ useScope: () => mockScope.value }));

type Fn = jest.Mock<(...a: any[]) => Promise<any>>;
const tx = require('@/services/transaction.service') as { createTransaction: Fn };
const sched = require('@/services/scheduled.service') as { createScheduled: Fn };
const walletSvc = require('@/services/wallet.service') as { getWallets: Fn };
const debtSvc = require('@/services/debt.service') as { getDebts: Fn };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const wallet = (o: Partial<Wallet> = {}) => ({ id: 'fw1', name: 'Household', bank: 'Cash', currency: 'RWF', balance: 10000, color: 'teal', walletType: 'CASH', last4: null, archived: false, isDefault: true, ...o }) as unknown as Wallet;
const loan = () => ({ id: 'l1', kind: 'BORROWED', person: 'amza', amount: 50000, unspent: 30000, currency: 'RWF', status: 'OPEN', archived: false }) as unknown as Debt;
const family = { id: 'fam-12345678', name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' };
const personal = () => ({ ready: true, isFamily: false, scope: 'personal', family: null, role: null, can: () => true, switchTo: jest.fn(async () => {}) });
const inFamily = (role: string) => ({
  ready: true, isFamily: true, scope: 'family', family, role, switchTo: jest.fn(async () => {}),
  can: (a: string) => ({ OWNER: true, ADMIN: true, MEMBER: a === 'tx.add' || a === 'tx.edit.own', VIEWER: false } as Record<string, boolean>)[role],
});
const mount = () => render(<SafeAreaProvider initialMetrics={metrics}><LanguageProvider><AddTransactionScreen /></LanguageProvider></SafeAreaProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.value = {};
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  walletSvc.getWallets.mockResolvedValue([wallet()]);
  debtSvc.getDebts.mockResolvedValue([loan()]);
  tx.createTransaction.mockResolvedValue({});
  sched.createScheduled.mockResolvedValue({});
  mockScope.value = personal();
});
afterEach(cleanup);

describe('Add in Personal (unchanged)', () => {
  test('asks for loans, offers them, and shows the Repeat row', async () => {
    await mount();
    await waitFor(() => expect(debtSvc.getDebts).toHaveBeenCalled());
    expect(screen.queryByTestId('adding-to-banner')).toBeNull();
    expect(screen.getByText('Repeat')).toBeTruthy();
    await fireEvent.press(await screen.findByTestId('pay-from-field'));
    expect(screen.getByText('BORROWED MONEY')).toBeTruthy();
  });
});

describe('Add inside a family', () => {
  beforeEach(() => { mockScope.value = inFamily('MEMBER'); });

  test('says where it is adding, and that everyone will see it', async () => {
    await mount();
    expect(await screen.findByText('Adding to: Mwiza Family')).toBeTruthy();
    expect(screen.getByText('Everyone in the family will see this.')).toBeTruthy();
  });

  test('never asks for loans and never offers borrowed money', async () => {
    await mount();
    await fireEvent.press(await screen.findByTestId('pay-from-field'));
    expect(debtSvc.getDebts).not.toHaveBeenCalled();
    expect(screen.queryByText('BORROWED MONEY')).toBeNull();
    expect(screen.getAllByTestId('pay-from-wallet')).toHaveLength(1);
  });

  test('has no Repeat row (a family has no scheduled transactions yet)', async () => {
    await mount();
    await screen.findByText('Adding to: Mwiza Family');
    expect(screen.queryByText('Repeat')).toBeNull();
  });

  test('saves a normal transaction with the family wallet', async () => {
    await mount();
    await fireEvent.changeText(await screen.findByPlaceholderText('0'), '500');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(tx.createTransaction).toHaveBeenCalled());
    expect(tx.createTransaction.mock.calls[0][0]).toMatchObject({ type: 'EXPENSE', amount: 500, walletId: 'fw1' });
    expect(tx.createTransaction.mock.calls[0][0].fundedByDebtId).toBeUndefined();
    expect(sched.createScheduled).not.toHaveBeenCalled();
  });

  test('a future date is refused with an explanation, and nothing is saved or scheduled', async () => {
    mockParams.value = { date: new Date(Date.now() + 3 * 86400000).toISOString() };
    await mount();
    await fireEvent.changeText(await screen.findByPlaceholderText('0'), '500');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as unknown as jest.Mock).mock.calls.at(-1)![1]).toBe('Family transactions cannot be scheduled yet. Choose today or an earlier date.');
    expect(tx.createTransaction).not.toHaveBeenCalled();
    expect(sched.createScheduled).not.toHaveBeenCalled();
  });

  test('a past date is fine', async () => {
    mockParams.value = { date: new Date(Date.now() - 3 * 86400000).toISOString() };
    await mount();
    await fireEvent.changeText(await screen.findByPlaceholderText('0'), '500');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(tx.createTransaction).toHaveBeenCalled());
  });

  test('a family with no wallet yet says so and who can fix it', async () => {
    walletSvc.getWallets.mockResolvedValue([]);
    await mount();
    expect(await screen.findByTestId('family-no-wallet')).toBeTruthy();
    expect(screen.getByText('The family has no wallet yet. Ask an admin to create one.')).toBeTruthy();
  });

  test.each(['OWNER', 'ADMIN'])('%s can add', async role => {
    mockScope.value = inFamily(role);
    await mount();
    expect(await screen.findByText('Adding to: Mwiza Family')).toBeTruthy();
    expect(screen.queryByTestId('viewer-cannot-add')).toBeNull();
  });

  test('a Viewer sees an explanation instead of the form, and can close it', async () => {
    mockScope.value = inFamily('VIEWER');
    await mount();
    expect(await screen.findByTestId('viewer-cannot-add')).toBeTruthy();
    expect(screen.getByText("You can't add here")).toBeTruthy();
    expect(screen.queryByPlaceholderText('0')).toBeNull();
    await fireEvent.press(screen.getByTestId('viewer-close'));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  test('a refusal from the server is shown', async () => {
    tx.createTransaction.mockRejectedValue(Object.assign(new Error('x'), { response: { data: { message: 'Your role does not allow this' } } }));
    await mount();
    await fireEvent.changeText(await screen.findByPlaceholderText('0'), '500');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Error', 'Your role does not allow this'));
  });
});
