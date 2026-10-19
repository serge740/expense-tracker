export class CreateDebtDto {
  kind: 'BORROWED' | 'LENT';
  person: string;
  phone?: string;
  amount: number;
  /** Required when no wallet is given; otherwise the wallet's currency is used. */
  currency?: string;
  /** Wallet the money went into (borrowed) or came out of (lent). Optional. */
  walletId?: string;
  date?: string;
  dueDate?: string;
  note?: string;
}

export class UpdateDebtDto {
  person?: string;
  phone?: string;
  amount?: number;
  dueDate?: string | null;
  note?: string;
}

export class DebtPaymentDto {
  amount: number;
  walletId?: string;
  date?: string;
  note?: string;
}
