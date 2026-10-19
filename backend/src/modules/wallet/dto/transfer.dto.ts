export class TransferDto {
  fromWalletId: string;
  toWalletId: string;
  /** Amount leaving the source wallet, in its currency. */
  amount: number;
  /** Optional manual rate (1 source unit = rate destination units) for cross-currency transfers. */
  rate?: number;
  note?: string;
  date?: string;
}
