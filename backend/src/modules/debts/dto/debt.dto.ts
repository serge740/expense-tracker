export class CreateDebtDto {
  kind: 'BORROWED' | 'LENT';
  person: string;
  phone?: string;
  amount: number;
  /** Required when no wallet is given; otherwise the wallet's currency is used. */
  currency?: string;
  /** Credits only: the wallet the money comes out of (optional). Ignored for a debt, which never uses a wallet. */
  walletId?: string;
  date?: string;
  dueDate?: string;
  note?: string;
  /** Remind me about the pay dates. Defaults to on for a debt, off for a credit. */
  remind?: boolean;
}

export class UpdateDebtDto {
  person?: string;
  phone?: string;
  amount?: number;
  dueDate?: string | null;
  note?: string;
  remindersOn?: boolean;
}

export class DebtPaymentDto {
  amount: number;
  walletId?: string;
  date?: string;
  note?: string;
}

export class InstallmentDto {
  /** ISO date-time of the pay date. */
  dueAt: string;
  /** What this date asks for. Leave empty for "the rest". */
  plannedAmount?: number | null;
  note?: string;
}
