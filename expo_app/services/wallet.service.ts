import api from '@/api';

export type WalletType = 'CHECKING' | 'SAVINGS' | 'CREDIT' | 'CASH' | 'MOBILE_MONEY';

export interface Wallet {
  id: string;
  name: string;
  bank: string;
  last4: string | null;
  accountHolder: string | null;
  accountNumber: string | null;
  color: string;
  walletType: WalletType | string;
  balance: number;
  currency: string;
  archived: boolean;
  isDefault: boolean;
}

export interface WalletSummary {
  totalBalance: number;
  walletCount: number;
}

export interface WalletOverview {
  base: string;
  total: number;
  yesterday: number;
  change: number;
  walletCount: number;
  byCurrency: Record<string, number>;
  unconverted: string[];
  rates: Record<string, number>;
  ratesUpdatedAt: number | null;
}

export interface DailyFlow {
  base: string;
  days: { date: string; in: number; out: number }[];
  totalIn: number;
  totalOut: number;
}

export interface ActivityItem {
  id: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'DEBT';
  category: string;
  title: string;
  note: string | null;
  amount: number;
  toAmount: number | null;
  exchangeRate: number | null;
  date: string;
  wallet: { id: string; name: string; currency: string } | null;
  toWallet: { id: string; name: string; currency: string } | null;
}

export interface TransferQuote {
  from: string;
  to: string;
  rate: number | null;
  toAmount: number | null;
  ratesUpdatedAt: number | null;
}

export const getWallets = (): Promise<Wallet[]> =>
  api.get('/wallets').then(r => r.data);

export const getWallet = (id: string): Promise<Wallet> =>
  api.get(`/wallets/${id}`).then(r => r.data);

export const getWalletSummary = (): Promise<WalletSummary> =>
  api.get('/wallets/summary').then(r => r.data);

export const getWalletOverview = (base: string): Promise<WalletOverview> =>
  api.get('/wallets/overview', { params: { base } }).then(r => r.data);

export const getDailyFlow = (base: string, days = 7, walletId?: string): Promise<DailyFlow> =>
  api.get('/wallets/flow', { params: { base, days, walletId } }).then(r => r.data);

export const getActivity = (limit = 20, walletId?: string): Promise<ActivityItem[]> =>
  api.get('/wallets/activity', { params: { limit, walletId } }).then(r => r.data);

export const getBalanceHistory = (walletId: string, days = 30): Promise<{ currency: string; points: { date: string; balance: number }[] }> =>
  api.get(`/wallets/${walletId}/history`, { params: { days } }).then(r => r.data);

export const getRates = (base: string, codes: string[]): Promise<{ base: string; rates: Record<string, number>; updatedAt: number | null }> =>
  api.get('/wallets/rates', { params: { base, codes: codes.join(',') } }).then(r => r.data);

export const getTransferQuote = (from: string, to: string, amount: number): Promise<TransferQuote> =>
  api.get('/wallets/quote', { params: { from, to, amount } }).then(r => r.data);

export const transferBetweenWallets = (data: {
  fromWalletId: string; toWalletId: string; amount: number; rate?: number; note?: string;
}): Promise<{ id: string; amount: number; toAmount: number; rate: number; from: string; to: string }> =>
  api.post('/wallets/transfer', data).then(r => r.data);

export const createWallet = (data: Partial<Omit<Wallet, 'id' | 'isDefault'>>): Promise<Wallet> =>
  api.post('/wallets', data).then(r => r.data);

export const updateWallet = (id: string, data: Partial<Wallet>): Promise<Wallet> =>
  api.patch(`/wallets/${id}`, data).then(r => r.data);

export const deleteWallet = (id: string): Promise<{ success: boolean }> =>
  api.delete(`/wallets/${id}`).then(r => r.data);
