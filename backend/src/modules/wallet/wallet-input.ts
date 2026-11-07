import { BadRequestException } from '@nestjs/common';

const WALLET_TYPES = ['CHECKING', 'SAVINGS', 'CREDIT', 'CASH', 'MOBILE_MONEY'] as const;
const MAX_MONEY = 9_999_999_999;
const bad = (msg: string) => new BadRequestException(msg);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v).trim());

export interface WalletFields {
  name?: string; bank?: string; accountHolder?: string | null; accountNumber?: string | null; last4?: string | null; color?: string;
  walletType?: (typeof WALLET_TYPES)[number]; balance?: number; currency?: string; isDefault?: boolean; archived?: boolean;
}

/**
 * What a person typed for a wallet, checked and tidied. Anything wrong is refused with a sentence they can act on, so a bad value
 * never reaches the database. For a new wallet the name and the bank are required; for a change only what was sent is looked at.
 */
export function cleanWalletInput(input: unknown, mode: 'create' | 'update'): WalletFields {
  const b = (input ?? {}) as Record<string, unknown>;
  const out: WalletFields = {};
  const has = (k: string) => b[k] !== undefined;

  if (mode === 'create' || has('name')) {
    const name = text(b.name);
    if (!name) throw bad('Give the wallet a name.');
    if (name.length > 40) throw bad('Keep the wallet name to 40 characters or fewer.');
    out.name = name;
  }
  if (mode === 'create' || has('bank')) {
    const bank = text(b.bank);
    if (!bank) throw bad('Enter the bank or mobile money provider.');
    if (bank.length > 60) throw bad('Keep the bank or provider name to 60 characters or fewer.');
    out.bank = bank;
  }
  if (has('currency') && b.currency !== null && b.currency !== '') {
    const cur = text(b.currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) throw bad('Choose a valid currency.');
    out.currency = cur;
  }
  if (has('walletType') && b.walletType !== null) {
    if (!WALLET_TYPES.includes(b.walletType as never)) throw bad('Choose a wallet type.');
    out.walletType = b.walletType as WalletFields['walletType'];
  }
  if (has('balance') && b.balance !== null && b.balance !== '') {
    const n = Number(b.balance);
    if (!Number.isFinite(n) || Math.abs(n) > MAX_MONEY) throw bad('Enter a valid balance.');
    out.balance = Math.round(n * 100) / 100;
  }
  if (has('color') && b.color !== null) {
    const c = text(b.color);
    if (!c || c.length > 20) throw bad('Choose a card colour from the list.');
    out.color = c;
  }
  if (has('accountHolder')) {
    const h = text(b.accountHolder);
    if (h.length > 60) throw bad('Keep the account holder name to 60 characters or fewer.');
    out.accountHolder = h || null;
  }
  if (has('accountNumber')) {
    const n = text(b.accountNumber).replace(/\s+/g, '');
    if (n.length > 40) throw bad('That account or phone number is too long.');
    out.accountNumber = n || null;
    out.last4 = n.replace(/\D/g, '').slice(-4) || null;
  } else if (has('last4')) {
    const l = text(b.last4);
    if (l && !/^\d{1,4}$/.test(l)) throw bad('The last digits must be numbers only (up to 4).');
    out.last4 = l || null;
  }
  if (has('isDefault')) out.isDefault = !!b.isDefault;
  if (has('archived')) out.archived = !!b.archived;
  return out;
}
