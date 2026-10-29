import type { RepeatRule } from '../../scheduled/recurrence';

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
  /** Remind me about the pay dates. Defaults to on for a loan, off for a debt owed to me. */
  remind?: boolean;
  /** Loans only: the estimated payment, kept up on every repeat until the loan is paid off. The first pay date (dueDate) is where it starts. */
  planAmount?: number;
  planRepeat?: RepeatRule;
  /** The person's time zone, so "every month at 6pm" stays 6pm. */
  planTimezone?: string;
}

export class UpdateDebtDto {
  person?: string;
  phone?: string;
  amount?: number;
  dueDate?: string | null;
  note?: string;
  remindersOn?: boolean;
  /** Set or change the estimated payment (loans only). Send null for either to stop it. */
  planAmount?: number | null;
  planRepeat?: RepeatRule | null;
  /** Where the plan starts; defaults to the next unpaid pay date. */
  planStartAt?: string;
  planTimezone?: string;
}

export class DebtPaymentDto {
  amount: number;
  walletId?: string;
  date?: string;
  note?: string;
  /** Optional proof of payment, already uploaded through the receipts endpoint. */
  receiptUrl?: string;
  receiptReportUrl?: string;
}

export class InstallmentDto {
  /** ISO date-time of the pay date. */
  dueAt: string;
  /** What this date asks for. Leave empty for "the rest". */
  plannedAmount?: number | null;
  note?: string;
}
