import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(CURRENCIES[0]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val) {
        const found = CURRENCIES.find(c => c.code === val);
        if (found) setCurrencyState(found);
      }
    });
  }, []);

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    AsyncStorage.setItem(STORAGE_KEY, c.code);
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
