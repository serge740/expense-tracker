import { createContext, useContext, useState, type ReactNode } from 'react';
import { storage } from '@/lib/storage';

export interface Currency {
  code: string;
  symbol: string;
  name: string;
  flag: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$',    name: 'US Dollar',           flag: '🇺🇸' },
  { code: 'EUR', symbol: '€',    name: 'Euro',                flag: '🇪🇺' },
  { code: 'GBP', symbol: '£',    name: 'British Pound',       flag: '🇬🇧' },
  { code: 'NGN', symbol: '₦',    name: 'Nigerian Naira',      flag: '🇳🇬' },
  { code: 'RWF', symbol: 'FRw',  name: 'Rwandan Franc',       flag: '🇷🇼' },
  { code: 'UGX', symbol: 'USh',  name: 'Ugandan Shilling',    flag: '🇺🇬' },
  { code: 'TZS', symbol: 'TSh',  name: 'Tanzanian Shilling',  flag: '🇹🇿' },
  { code: 'BIF', symbol: 'FBu',  name: 'Burundian Franc',     flag: '🇧🇮' },
  { code: 'CDF', symbol: 'FC',   name: 'Congolese Franc',     flag: '🇨🇩' },
  { code: 'ETB', symbol: 'Br',   name: 'Ethiopian Birr',      flag: '🇪🇹' },
  { code: 'GHS', symbol: 'GH₵',  name: 'Ghanaian Cedi',       flag: '🇬🇭' },
  { code: 'KES', symbol: 'KSh',  name: 'Kenyan Shilling',     flag: '🇰🇪' },
  { code: 'ZAR', symbol: 'R',    name: 'South African Rand',  flag: '🇿🇦' },
  { code: 'EGP', symbol: 'E£',   name: 'Egyptian Pound',      flag: '🇪🇬' },
  { code: 'MAD', symbol: 'MAD',  name: 'Moroccan Dirham',     flag: '🇲🇦' },
  { code: 'INR', symbol: '₹',    name: 'Indian Rupee',        flag: '🇮🇳' },
  { code: 'JPY', symbol: '¥',    name: 'Japanese Yen',        flag: '🇯🇵' },
  { code: 'CNY', symbol: '¥',    name: 'Chinese Yuan',        flag: '🇨🇳' },
  { code: 'AED', symbol: 'AED',  name: 'UAE Dirham',          flag: '🇦🇪' },
  { code: 'SAR', symbol: 'SAR',  name: 'Saudi Riyal',         flag: '🇸🇦' },
  { code: 'CAD', symbol: 'CA$',  name: 'Canadian Dollar',     flag: '🇨🇦' },
  { code: 'AUD', symbol: 'A$',   name: 'Australian Dollar',   flag: '🇦🇺' },
  { code: 'CHF', symbol: 'CHF',  name: 'Swiss Franc',         flag: '🇨🇭' },
  { code: 'BRL', symbol: 'R$',   name: 'Brazilian Real',      flag: '🇧🇷' },
  { code: 'MXN', symbol: 'MX$',  name: 'Mexican Peso',        flag: '🇲🇽' },
  { code: 'TRY', symbol: '₺',    name: 'Turkish Lira',        flag: '🇹🇷' },
];

const STORAGE_KEY = '@aby_currency';

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: CURRENCIES[0],
  setCurrency: () => {},
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    const saved = storage.get(STORAGE_KEY);
    return CURRENCIES.find(c => c.code === saved) ?? CURRENCIES[0];
  });

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    storage.set(STORAGE_KEY, c.code);
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

// Currencies normally shown without decimals.
const ZERO_DECIMAL = new Set(['RWF', 'UGX', 'TZS', 'BIF', 'CDF', 'JPY', 'KES', 'NGN']);

export const currencyByCode = (code: string): Currency =>
  CURRENCIES.find(c => c.code === code) ?? { code, symbol: code, name: code, flag: '🏳️' };

/** "FRw 12,500" / "$ 1,204.50" — or masked when balances are hidden. */
export function formatMoney(amount: number, code: string, opts: { hidden?: boolean; sign?: boolean } = {}) {
  const c = currencyByCode(code);
  if (opts.hidden) return `${c.symbol} ••••`;
  const digits = ZERO_DECIMAL.has(code) ? 0 : 2;
  const abs = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sign = amount < 0 ? '−' : opts.sign && amount > 0 ? '+' : '';
  return `${sign}${c.symbol} ${abs}`;
}
