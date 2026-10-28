import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import AddTransactionScreen from '@/app/(dashboard)/add';
import { PayFromField } from '@/components/add/pay-from';
import { ReceiptField } from '@/components/add/receipt-field';
import type { Wallet } from '@/services/wallet.service';
import type { Debt } from '@/services/debt.service';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('@/env', () => ({ __esModule: true, default: { UPLOADS_URL: 'http://uploads.test' } }));
const mockRouter = { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({
  get router() { return mockRouter; },
  useLocalSearchParams: () => ({}),
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
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)',
    buttonBg: '#00627F', headerBg: '#00627F', text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9',
    border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));

type Fn = jest.Mock<(...a: any[]) => Promise<any>>;
const tx = require('@/services/transaction.service') as { createTransaction: Fn };
const walletSvc = require('@/services/wallet.service') as { getWallets: Fn };
const debtSvc = require('@/services/debt.service') as { getDebts: Fn };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const wallet = (o: Partial<Wallet> = {}) => ({ id: 'w1', name: 'Equity Bank', bank: 'Equity', currency: 'USD', balance: 1000, color: 'teal', walletType: 'CHECKING', last4: '0121', archived: false, isDefault: true, ...o }) as unknown as Wallet;
const loan = (o: Partial<Debt> = {}) => ({ id: 'l1', kind: 'BORROWED', person: 'amza', amount: 50000, unspent: 30000, currency: 'USD', status: 'OPEN', archived: false, ...o }) as unknown as Debt;

const ui = (node: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={metrics}><LanguageProvider>{node}</LanguageProvider></SafeAreaProvider>
);

afterEach(cleanup);
beforeEach(() => { jest.clearAllMocks(); });

describe('PayFromField', () => {
  const props = () => ({ wallets: [wallet(), wallet({ id: 'w2', name: 'MoMo', currency: 'RWF', last4: null })], loans: [loan()], walletId: 'w1' as string | null, loanId: null as string | null, onWallet: jest.fn(), onLoan: jest.fn() });

  test('shows the chosen wallet in one field, with its currency and last digits', async () => {
    await render(ui(<PayFromField {...props()} />));
    expect(screen.getByText('Equity Bank')).toBeTruthy();
    expect(screen.getByText('USD · •• 0121')).toBeTruthy();
    expect(screen.queryByText('MoMo')).toBeNull();            // the other wallets are behind the tap
  });

  test('tapping it lists every wallet and the loans with money left', async () => {
    await render(ui(<PayFromField {...props()} />));
    await fireEvent.press(screen.getByTestId('pay-from-field'));
    expect(screen.getByText('Pay from')).toBeTruthy();
    expect(screen.getByText('MY WALLETS')).toBeTruthy();
    expect(screen.getAllByTestId('pay-from-wallet')).toHaveLength(2);
    expect(screen.getByText('BORROWED MONEY')).toBeTruthy();
    expect(screen.getAllByTestId('pay-from-loan')).toHaveLength(1);
    expect(screen.getByText(/Loan · .*30,000.* left/)).toBeTruthy();
    expect(screen.getByText('Paying from a loan does not change any of your wallets.')).toBeTruthy();
  });

  test('choosing a wallet reports it and closes the sheet', async () => {
    const p = props();
    await render(ui(<PayFromField {...p} />));
    await fireEvent.press(screen.getByTestId('pay-from-field'));
    await fireEvent.press(screen.getAllByTestId('pay-from-wallet')[1]);
    expect(p.onWallet).toHaveBeenCalledWith('w2');
    await waitFor(() => expect(screen.queryByText('MY WALLETS')).toBeNull());
  });

  test('choosing a loan reports it', async () => {
    const p = props();
    await render(ui(<PayFromField {...p} />));
    await fireEvent.press(screen.getByTestId('pay-from-field'));
    await fireEvent.press(screen.getByTestId('pay-from-loan'));
    expect(p.onLoan).toHaveBeenCalledWith('l1');
  });

  test('with a loan chosen, the field shows the loan, and no wallet is ticked', async () => {
    await render(ui(<PayFromField {...props()} loanId="l1" />));
    expect(screen.getByText('amza')).toBeTruthy();
    expect(screen.queryByText('Equity Bank')).toBeNull();
  });

  test('without loans there is no borrowed-money section, and the sheet is just "Wallet"', async () => {
    await render(ui(<PayFromField {...props()} loans={[]} />));
    await fireEvent.press(screen.getByTestId('pay-from-field'));
    expect(screen.queryByText('BORROWED MONEY')).toBeNull();
    expect(screen.getAllByText('Wallet').length).toBeGreaterThan(0);
  });

  test('a person with no wallet sees "None"', async () => {
    await render(ui(<PayFromField {...props()} wallets={[]} loans={[]} walletId={null} />));
    expect(screen.getByText('None')).toBeTruthy();
  });
});

describe('ReceiptField', () => {
  const props = (o: Partial<React.ComponentProps<typeof ReceiptField>> = {}) => ({
    attached: false, previewUri: null, isImage: true, fileName: null, analyzing: false,
    onScan: jest.fn(), onCamera: jest.fn(), onFile: jest.fn(), onRemove: jest.fn(), ...o,
  });

  test('without a receipt it says "Add a receipt", and the three ways are behind the tap', async () => {
    await render(ui(<ReceiptField {...props()} />));
    expect(screen.getByText('Add a receipt')).toBeTruthy();
    expect(screen.queryByText('Scan receipt')).toBeNull();
    await fireEvent.press(screen.getByTestId('receipt-field'));
    expect(screen.getByText('Scan receipt')).toBeTruthy();
    expect(screen.getByText('Take photo')).toBeTruthy();
    expect(screen.getByText('Choose file')).toBeTruthy();
    expect(screen.queryByTestId('receipt-remove')).toBeNull();
  });

  const ACTIONS: [string, 'onScan' | 'onCamera' | 'onFile'][] = [['receipt-scan', 'onScan'], ['receipt-camera', 'onCamera'], ['receipt-file', 'onFile']];
  test.each(ACTIONS)('%s runs its action and closes the sheet', async (id, handler) => {
    const p = props();
    await render(ui(<ReceiptField {...p} />));
    await fireEvent.press(screen.getByTestId('receipt-field'));
    await fireEvent.press(screen.getByTestId(id));
    expect(p[handler]).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Scan receipt')).toBeNull());
  });

  test('with a receipt attached it says so, and the sheet can remove it', async () => {
    const p = props({ attached: true, previewUri: 'http://x/r.jpg' });
    await render(ui(<ReceiptField {...p} />));
    expect(screen.getByText('Receipt attached')).toBeTruthy();
    expect(screen.getByText('Tap to change or remove')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('receipt-field'));
    await fireEvent.press(screen.getByTestId('receipt-remove'));
    expect(p.onRemove).toHaveBeenCalledTimes(1);
  });

  test('a file that is not a picture shows its name', async () => {
    await render(ui(<ReceiptField {...props({ attached: true, isImage: false, fileName: 'invoice.pdf' })} />));
    expect(screen.getByText('invoice.pdf')).toBeTruthy();
  });

  test('while it is being read the field says so and cannot be opened', async () => {
    const p = props({ analyzing: true });
    await render(ui(<ReceiptField {...p} />));
    expect(screen.getByText('Analyzing receipt…')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('receipt-field'));
    expect(screen.queryByText('Scan receipt')).toBeNull();
  });
});

describe('Add screen: the wallet and receipt fields', () => {
  async function mount() {
    walletSvc.getWallets.mockResolvedValue([wallet(), wallet({ id: 'w2', name: 'MoMo', currency: 'RWF', last4: null, isDefault: false })]);
    debtSvc.getDebts.mockResolvedValue([loan()]);
    tx.createTransaction.mockResolvedValue({});
    await render(ui(<AddTransactionScreen />));
    await screen.findByText('Equity Bank');
  }

  test('the old row of wallet chips, the borrowed-money chips and the three receipt buttons are gone', async () => {
    await mount();
    expect(screen.queryByTestId('pot-chip')).toBeNull();
    expect(screen.queryByText('Or pay from borrowed money')).toBeNull();
    expect(screen.queryByText('Scan receipt')).toBeNull();
    expect(screen.queryByText('Take photo')).toBeNull();
    expect(screen.getByTestId('pay-from-field')).toBeTruthy();
    expect(screen.getByTestId('receipt-field')).toBeTruthy();
  });

  test('a normal save uses the wallet shown', async () => {
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '100');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(tx.createTransaction).toHaveBeenCalledTimes(1));
    expect(tx.createTransaction.mock.calls[0][0]).toMatchObject({ walletId: 'w1' });
    expect(tx.createTransaction.mock.calls[0][0].fundedByDebtId).toBeUndefined();
  });

  test('picking a loan pays from borrowed money: no wallet is sent', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('pay-from-field'));
    await fireEvent.press(await screen.findByTestId('pay-from-loan'));
    expect(await screen.findByText('amza')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '100');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(tx.createTransaction).toHaveBeenCalledTimes(1));
    const body = tx.createTransaction.mock.calls[0][0];
    expect(body.fundedByDebtId).toBe('l1');
    expect(body.walletId).toBeUndefined();
  });

  test('changing to Income forgets the loan, so income is never "paid from" borrowed money', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('pay-from-field'));
    await fireEvent.press(await screen.findByTestId('pay-from-loan'));
    await screen.findByText('amza');
    await fireEvent.press(screen.getByText('Income'));
    await waitFor(() => expect(screen.queryByText('amza')).toBeNull());
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '100');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(tx.createTransaction).toHaveBeenCalledTimes(1));
    expect(tx.createTransaction.mock.calls[0][0].fundedByDebtId).toBeUndefined();
  });

  test('"Scan receipt" in the sheet opens the scanner', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('receipt-field'));
    await fireEvent.press(screen.getByTestId('receipt-scan'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(dashboard)/scan');
  });
});
