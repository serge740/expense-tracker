import type React from 'react';
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';

/** Icon per wallet type, shared by cards, chips and pickers. */
export const WALLET_TYPE_ICON: Record<string, React.ComponentProps<typeof MaterialIcons>['name']> = {
  CHECKING: 'account-balance',
  SAVINGS: 'savings',
  CREDIT: 'credit-card',
  CASH: 'payments',
  MOBILE_MONEY: 'phone-iphone',
};

/** Lighten a #RRGGBB colour toward white by `amt` (0–1). */
export function tint(hex: string, amt: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
