// Ported from expo_app/services/debt.service.ts
import api from '@/api';
import type { RepeatRule } from '@/utils/recurrence';

export type DebtKind = 'BORROWED' | 'LENT';

export interface DebtPayment {
  id: string;
  amount: number;
  date: string;
  walletId: string | null;
  note: string | null;
  /** Optional proof of payment kept with it. */
  receiptUrl?: string | null;
  receiptReportUrl?: string | null;
}

/** OPEN has a balance; SETTLED was paid in full; WRITTEN_OFF (credit) / FORGIVEN (debt) closed with the remainder dropped. */
export type DebtStatus = 'OPEN' | 'SETTLED' | 'WRITTEN_OFF' | 'FORGIVEN';

/** Derived on the server from the money paid so far (oldest pay date is filled first). */
export type InstallmentView = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'UPCOMING' | 'MOVED' | 'SKIPPED';

export interface DebtInstallment {
  id: string;
  dueAt: string;
  plannedAmount: number | null;
  status: 'PENDING' | 'MOVED' | 'SKIPPED';
  view: InstallmentView;
  covered: number;
  movedFromId: string | null;
  note: string | null;
  /** Made by the loan's estimated payment (it may change while it is still ahead). */
  fromPlan?: boolean;
}

/** A loan's estimated payment: how much each time, how often, and where it ends. */
export interface DebtPlan {
  amount: number;
  repeat: RepeatRule;
  /** The first pay date; the repeat counts from here. */
  startAt: string;
  timezone: string;
  /** The date of the last payment, or null when the repeat stops before the loan is paid off. */
  finishesAt: string | null;
  paymentsLeft: number;
  shortfall: number;
}

export interface Debt {
  id: string;
  kind: DebtKind;
  person: string;
  phone: string | null;
  amount: number;
  paid: number;
  writtenOffAmount: number;
  /** Borrowed money already spent on expenses, and what is still unspent (debts only). */
  spent?: number;
  unspent?: number | null;
  remaining: number;
  currency: string;
  date: string;
  dueDate: string | null;
  note: string | null;
  walletId: string | null;
  principalTransactionId: string | null;
  status: DebtStatus;
  archived: boolean;
  overdue: boolean;
  /** Earliest pay date that is not paid yet (null when none, or the debt is closed). */
  nextDueAt: string | null;
  /** What the next pay date asks for now (its estimated payment), when it has an amount of its own. */
  nextPayment?: number | null;
  remindersOn: boolean;
  /** The live reminder for the next unpaid pay date, if any. */
  reminderId: string | null;
  reminderStatus: 'ACTIVE' | 'SNOOZED' | null;
  /** When it will fire next (for a snoozed reminder: when the snooze ends). */
  nextReminderAt: string | null;
  payments: DebtPayment[];
  installments: DebtInstallment[];
  /** Loans only: the estimated payment, or null when there is none. */
  plan?: DebtPlan | null;
}

export interface LedgerCurrency {
  currency: string; taken: number; paid: number; writtenOff: number; remaining: number;
  debtCount: number; openCount: number; settledCount: number; closedOutCount: number; overdueCount: number;
}

/** Totals behind the Debt wallet (BORROWED) and Credit wallet (LENT). Currencies are never mixed. */
export interface Ledger {
  kind: DebtKind; currencies: LedgerCurrency[];
  debtCount: number; openCount: number; settledCount: number; closedOutCount: number; overdueCount: number;
}

export interface LedgerTransaction {
  id: string; type: 'INCOME' | 'EXPENSE' | 'DEBT'; title: string; amount: number; date: string;
  walletId: string | null; debtId: string | null; debtRole: 'BORROW_IN' | 'LEND_OUT' | 'REPAY_OUT' | 'REPAY_IN' | null;
  person?: string; currency?: string; debtKind?: DebtKind;
}

export interface DebtSummary {
  owe: Record<string, number>;
  owed: Record<string, number>;
  openCount: number;
  overdue: number;
}

export const getDebts = (): Promise<Debt[]> => api.get('/debts').then(r => r.data);
/** Builds the statement PDF on the server and saves it to the device (shared through the share sheet on a phone). */
export async function shareDebtStatement(id: string): Promise<void> {
  const { filename, base64 } = (await api.get(`/debts/${id}/statement`)).data as { filename: string; base64: string };
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const file = new File([bytes], filename, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if ((e as DOMException)?.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export const getDebtSummary = (): Promise<DebtSummary> => api.get('/debts/summary').then(r => r.data);

export const createDebt = (data: {
  kind: DebtKind; person: string; phone?: string; amount: number; currency?: string;
  walletId?: string; date?: string; dueDate?: string; note?: string; remind?: boolean;
  /** Loans only: how much to pay each time and how often, from the first pay date (dueDate) until the loan is paid off. */
  planAmount?: number; planRepeat?: RepeatRule; planTimezone?: string;
}): Promise<Debt> => api.post('/debts', data).then(r => r.data);

export const updateDebt = (id: string, data: {
  person?: string; phone?: string; amount?: number; dueDate?: string | null; note?: string; remindersOn?: boolean;
  /** Set or change the estimated payment (loans only); send null for planAmount to stop it. */
  planAmount?: number | null; planRepeat?: RepeatRule | null; planStartAt?: string; planTimezone?: string;
}): Promise<Debt> =>
  api.patch(`/debts/${id}`, data).then(r => r.data);

export const addDebtPayment = (id: string, data: { amount: number; walletId?: string; date?: string; note?: string; receiptUrl?: string; receiptReportUrl?: string }): Promise<Debt> =>
  api.post(`/debts/${id}/payments`, data).then(r => r.data);

export const removeDebtPayment = (id: string, paymentId: string): Promise<Debt> =>
  api.delete(`/debts/${id}/payments/${paymentId}`).then(r => r.data);

export const deleteDebt = (id: string): Promise<{ success: boolean }> =>
  api.delete(`/debts/${id}`).then(r => r.data);

export const getDebt = (id: string): Promise<Debt> => api.get(`/debts/${id}`).then(r => r.data);
export const getArchivedDebts = (): Promise<Debt[]> => api.get('/debts', { params: { archived: 'only' } }).then(r => r.data);

export const getLedger = (kind: DebtKind): Promise<Ledger> => api.get('/debts/ledger', { params: { kind } }).then(r => r.data);
export const getLedgerTransactions = (kind: DebtKind, page = 1): Promise<{ items: LedgerTransaction[]; total: number; page: number; limit: number }> =>
  api.get('/debts/ledger/transactions', { params: { kind, page } }).then(r => r.data);

export const addInstallment = (id: string, data: { dueAt: string; plannedAmount?: number | null; note?: string }): Promise<Debt> =>
  api.post(`/debts/${id}/installments`, data).then(r => r.data);
export const moveInstallment = (id: string, installmentId: string, dueAt: string): Promise<Debt> =>
  api.post(`/debts/${id}/installments/${installmentId}/move`, { dueAt }).then(r => r.data);
export const skipInstallment = (id: string, installmentId: string): Promise<Debt> =>
  api.post(`/debts/${id}/installments/${installmentId}/skip`).then(r => r.data);

export const writeOffDebt = (id: string): Promise<Debt> => api.post(`/debts/${id}/write-off`).then(r => r.data);
export const reopenDebt = (id: string): Promise<Debt> => api.post(`/debts/${id}/reopen`).then(r => r.data);
export const archiveDebt = (id: string): Promise<Debt> => api.post(`/debts/${id}/archive`).then(r => r.data);
export const restoreDebt = (id: string): Promise<Debt> => api.post(`/debts/${id}/restore`).then(r => r.data);
