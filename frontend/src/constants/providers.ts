// Ported from expo_app/constants/providers.ts
// Banks and mobile-money providers offered when creating a wallet.
// Rwanda first, then the region. Users can always type a name instead.

export const BANKS = [
  'Bank of Kigali', 'Equity Bank', 'I&M Bank', 'BPR Bank', 'Access Bank', 'Ecobank',
  'NCBA Bank', 'GT Bank', 'Cogebanque', 'Bank of Africa', 'AB Bank', 'Urwego Bank',
  'Unguka Bank', 'Zigama CSS', 'KCB Bank', 'Stanbic Bank', 'Absa Bank', 'CRDB Bank', 'NMB Bank',
];

export const MOBILE_MONEY = [
  'MTN MoMo', 'Airtel Money', 'M-Pesa', 'Tigo Pesa', 'Lumicash', 'Orange Money', 'Wave',
];

export type WalletKind = 'bank' | 'mobile' | 'cash';

export const KIND_META: Record<WalletKind, { label: string; icon: 'account-balance' | 'phone-iphone' | 'payments'; walletType: 'CHECKING' | 'MOBILE_MONEY' | 'CASH' }> = {
  bank:   { label: 'Bank',         icon: 'account-balance', walletType: 'CHECKING' },
  mobile: { label: 'Mobile money', icon: 'phone-iphone',    walletType: 'MOBILE_MONEY' },
  cash:   { label: 'Cash',         icon: 'payments',        walletType: 'CASH' },
};
