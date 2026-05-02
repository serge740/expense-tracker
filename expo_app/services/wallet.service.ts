import api from '@/api';

export interface Wallet {
  id: string;
  name: string;
  bank: string;
  last4: string | null;
  color: string;
  walletType: string;
  balance: number;
  isDefault: boolean;
}

export interface WalletSummary {
  totalBalance: number;
  walletCount: number;
}

export const getWallets = (): Promise<Wallet[]> =>
  api.get('/wallets').then(r => r.data);

export const getWalletSummary = (): Promise<WalletSummary> =>
  api.get('/wallets/summary').then(r => r.data);

export const createWallet = (data: Partial<Omit<Wallet, 'id' | 'isDefault'>>): Promise<Wallet> =>
  api.post('/wallets', data).then(r => r.data);

export const updateWallet = (id: string, data: Partial<Wallet>): Promise<Wallet> =>
  api.patch(`/wallets/${id}`, data).then(r => r.data);

export const deleteWallet = (id: string): Promise<{ success: boolean }> =>
  api.delete(`/wallets/${id}`).then(r => r.data);
