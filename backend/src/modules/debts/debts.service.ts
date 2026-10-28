import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DebtRole, Prisma } from '../../../generated/prisma';
import { CreateDebtDto, DebtPaymentDto, InstallmentDto, UpdateDebtDto } from './dto/debt.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { RemindersService } from '../reminders/reminders.service';
import { isValidTimeZone } from '../reminders/reminder-policy';
import { DebtPlanService, planInputOf } from './debt-plan.service';
import { normalizePlanRule, planChanges, planProblem } from './debt-plan';
import {
  buildLedger, capitalNoun, CLOSED_STATUSES, DebtKindName, directionFor, nounOf, remainingOf, roleFor, rolesOf, round2, statusFor,
} from './debt-accounting';
import { deriveInstallments, finalDeadline, InstallmentInput, isOverdue, nextUnpaid } from './debt-installments';

type Tx = Prisma.TransactionClient;

/**
 * Money you borrowed (BORROWED) or lent (LENT), with repayments.
 * Every event is recorded as a transaction in the "loan" category, linked by debtId and tagged with a debtRole.
 * A debt (money I borrowed) never touches one of my wallets: it lives under the Debt wallet. A credit (money I
 * lent) takes money from / returns money to the wallet I choose, or touches none when I choose none:
 *   BORROW_IN  borrowed money received  (INCOME, but never counted as income)
 *   REPAY_OUT  I repaid what I borrowed (EXPENSE)
 *   LEND_OUT   I lent money out          (EXPENSE)
 *   REPAY_IN   I was repaid              (INCOME)
 */
@Injectable()
export class DebtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly reminders: RemindersService,
    private readonly plans: DebtPlanService,
  ) {}

  private serialize(d: any) {
    const amount = Number(d.amount);
    const paid = Number(d.paid);
    const writtenOff = Number(d.writtenOffAmount ?? 0);
    const rows: InstallmentInput[] = (d.installments ?? []).map((i: any) => ({
      id: i.id, dueAt: new Date(i.dueAt), plannedAmount: i.plannedAmount == null ? null : Number(i.plannedAmount), status: i.status,
    }));
    const derived = deriveInstallments({ amount, writtenOff, paid, installments: rows });
    const next = d.status === 'OPEN' ? nextUnpaid(rows, derived) : null;
    const live = d.status === 'OPEN' && !d.archivedAt;
    const rem = (d.reminders ?? [])[0];
    const planInput = planInputOf(d, new Date());
    const planResult = planInput.plan ? planChanges(planInput) : null;
    return {
      ...d,
      // The plan is shown as one object (below), not as loose columns.
      planAmount: undefined, planRepeat: undefined, planStartAt: undefined, planTimezone: undefined,
      plan: planInput.plan && planResult ? {
        amount: planInput.plan.amount,
        repeat: planInput.plan.rule,
        startAt: planInput.plan.startAt,
        timezone: planInput.plan.timezone,
        /** The date of the last payment, or null when the plan stops before the loan is paid off. */
        finishesAt: planResult.finishesAt,
        paymentsLeft: planResult.paymentsLeft,
        shortfall: planResult.shortfall,
      } : null,
      reminders: undefined,
      reminderId: rem?.id ?? null,
      reminderStatus: rem?.status ?? null,
      nextReminderAt: rem?.nextFireAt ?? null,
      amount,
      paid,
      writtenOffAmount: writtenOff,
      remaining: remainingOf(amount, paid, writtenOff),
      spent: Number(d.spent ?? 0),
      unspent: d.kind === 'BORROWED' ? Math.max(0, round2(amount - Number(d.spent ?? 0))) : null,
      // Late = a pay date is overdue; a debt without pay dates falls back to its single due date.
      overdue: live && (rows.length ? isOverdue(derived) : !!d.dueDate && new Date(d.dueDate) < new Date()),
      archived: !!d.archivedAt,
      nextDueAt: next ? next.dueAt : null,
      payments: (d.payments ?? []).map((p: any) => ({ ...p, amount: Number(p.amount) })),
      installments: (d.installments ?? []).map((i: any) => {
        const x = derived.find(v => v.id === i.id)!;
        return { ...i, plannedAmount: x.planned || null, view: x.view, covered: x.covered };
      }),
    };
  }

  /** Every change to a debt ends here: reminders are re-aligned with its pay dates, then the debt is returned. */
  private async finish(clientId: string, id: string) {
    // The estimated payment plan first (it makes or trims pay dates), then the reminders follow those dates.
    await this.plans.reconcile(id).catch(() => undefined);
    await this.reminders.syncDebtSafe(id);
    return this.findOne(clientId, id);
  }

  private kindOf(kind?: string): DebtKindName {
    if (kind !== 'BORROWED' && kind !== 'LENT') throw new BadRequestException('Choose borrowed or lent');
    return kind;
  }

  private async owned(clientId: string, id: string) {
    const d = await this.prisma.debt.findFirst({ where: { id, clientId }, include: { payments: { orderBy: { date: 'desc' } }, installments: { orderBy: { dueAt: 'asc' } }, reminders: { where: { status: { in: ['ACTIVE', 'SNOOZED'] } } } } });
    if (!d) throw new NotFoundException('Loan or debt not found');
    return d;
  }

  private async wallet(clientId: string, walletId: string, currency: string) {
    const w = await this.prisma.wallet.findFirst({ where: { id: walletId, clientId } });
    if (!w) throw new NotFoundException('Wallet not found');
    if (w.currency !== currency) throw new BadRequestException(`Choose a ${currency} wallet for this record`);
    return w;
  }

  /** Move money for a debt event and return the transaction id. */
  private async move(prx: Tx, clientId: string, opts: {
    debtId: string; walletId: string | null; amount: number; direction: 'in' | 'out'; role: DebtRole; title: string; date: Date; note?: string | null;
  }) {
    const tx = await prx.transaction.create({
      data: {
        clientId,
        type: opts.direction === 'in' ? 'INCOME' : 'EXPENSE',
        category: 'loan',
        title: opts.title,
        description: opts.note ?? null,
        amount: opts.amount,
        date: opts.date,
        debtId: opts.debtId,
        debtRole: opts.role,
        walletId: opts.walletId,
      },
    });
    // No wallet (always the case for a debt): the event is recorded, no balance moves.
    if (opts.walletId) {
      await prx.wallet.update({
        where: { id: opts.walletId },
        data: { balance: opts.direction === 'in' ? { increment: opts.amount } : { decrement: opts.amount } },
      });
    }
    return tx.id;
  }

  /** Undo a debt transaction's effect on its wallet and delete it. */
  private async unmove(prx: Tx, transactionId: string) {
    const tx = await prx.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) return;
    const into = tx.type === 'INCOME' || (tx.type === 'DEBT' && !!tx.toWalletId);
    const walletId = tx.walletId ?? tx.toWalletId;
    if (walletId) {
      await prx.wallet.updateMany({ where: { id: walletId }, data: { balance: into ? { decrement: tx.amount } : { increment: tx.amount } } });
    }
    await prx.transaction.delete({ where: { id: transactionId } });
  }

  /** Re-derive paid + status from the payments that really exist (no running subtraction). */
  private async recompute(prx: Tx, debtId: string) {
    const d = await prx.debt.findUniqueOrThrow({ where: { id: debtId } });
    const agg = await prx.debtPayment.aggregate({ where: { debtId }, _sum: { amount: true } });
    const paid = round2(Number(agg._sum.amount ?? 0));
    const status = statusFor({
      kind: d.kind, amount: Number(d.amount), paid, writtenOff: Number(d.writtenOffAmount), current: d.status,
    });
    await prx.debt.update({ where: { id: debtId }, data: { paid, status } });
    return { paid, status, previous: d.status };
  }

  /** Keep Debt.dueDate equal to the last active pay date (the final deadline). */
  private async syncDeadline(prx: Tx, debtId: string) {
    const rows = await prx.debtInstallment.findMany({ where: { debtId } });
    const deadline = finalDeadline(rows.map(r => ({ id: r.id, dueAt: r.dueAt, plannedAmount: r.plannedAmount == null ? null : Number(r.plannedAmount), status: r.status })));
    if (rows.length) await prx.debt.update({ where: { id: debtId }, data: { dueDate: deadline } });
  }

  /** The person's time zone for the plan: the one their phone sent, else the one saved with their reminders. */
  private async planZone(clientId: string, requested?: string): Promise<string> {
    if (requested && isValidTimeZone(requested)) return requested;
    const pref = await this.prisma.notificationPreference.findUnique({ where: { clientId } });
    return pref?.timezone ?? 'UTC';
  }

  /** The estimated payment as it will be saved, or an error saying what to fix. */
  private async readPlan(clientId: string, input: { amount?: unknown; rule?: unknown; startAt?: string | Date | null; timezone?: string }, loanAmount: number) {
    const problem = planProblem({ amount: input.amount, rule: input.rule, loanAmount });
    if (problem) throw new BadRequestException(problem);
    const startAt = input.startAt ? new Date(input.startAt) : null;
    if (!startAt || Number.isNaN(startAt.getTime())) throw new BadRequestException('Choose the first pay date for the estimated payment');
    return {
      amount: round2(Number(input.amount)),
      rule: normalizePlanRule(input.rule as any),
      startAt,
      timezone: await this.planZone(clientId, input.timezone),
    };
  }

  private validDate(value?: string | null) {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) throw new BadRequestException('Choose a valid pay date');
    return d;
  }

  /** Pay-date edits only make sense on an open, un-archived debt. */
  private assertEditable(d: { kind: string; status: string; archivedAt: Date | null }) {
    if (d.status !== 'OPEN') throw new BadRequestException(`This ${nounOf(d.kind)} is already closed`);
    if (d.archivedAt) throw new BadRequestException(`Restore this ${nounOf(d.kind)} before changing its pay dates`);
  }

  private mapTx(t: any, debt?: { person: string; currency: string; kind: string }) {
    const raw = Number(t.amount);
    return {
      id: t.id,
      type: t.type,
      category: t.category,
      title: t.title,
      description: t.description,
      amount: t.type === 'INCOME' ? raw : -raw,
      date: t.date,
      walletId: t.walletId,
      receiptUrl: t.receiptUrl,
      debtId: t.debtId,
      debtRole: t.debtRole,
      ...(debt ? { person: debt.person, currency: debt.currency, debtKind: debt.kind } : {}),
    };
  }

  async list(clientId: string, kind?: string, status?: string, archived?: string) {
    const statusFilter: Prisma.DebtWhereInput =
      status === 'OPEN' ? { status: 'OPEN' }
      // The "Settled" tab shows everything that is no longer open.
      : status === 'SETTLED' ? { status: { in: CLOSED_STATUSES } }
      : status === 'WRITTEN_OFF' || status === 'FORGIVEN' ? { status }
      : {};
    const archivedFilter: Prisma.DebtWhereInput =
      archived === 'only' ? { archivedAt: { not: null } } : archived === 'include' ? {} : { archivedAt: null };

    const debts = await this.prisma.debt.findMany({
      where: {
        clientId,
        ...(kind === 'BORROWED' || kind === 'LENT' ? { kind } : {}),
        ...statusFilter,
        ...archivedFilter,
      },
      include: { payments: { orderBy: { date: 'desc' } }, installments: { orderBy: { dueAt: 'asc' } }, reminders: { where: { status: { in: ['ACTIVE', 'SNOOZED'] } } } },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });
    return debts.map(d => this.serialize(d));
  }

  async findOne(clientId: string, id: string) {
    return this.serialize(await this.owned(clientId, id));
  }

  /** Open balances per currency, split into what I owe and what I'm owed. */
  async summary(clientId: string) {
    const open = await this.prisma.debt.findMany({ where: { clientId, status: 'OPEN', archivedAt: null }, include: { installments: true } });
    const owe: Record<string, number> = {};
    const owed: Record<string, number> = {};
    let overdue = 0;
    for (const d of open) {
      const rem = remainingOf(Number(d.amount), Number(d.paid), Number(d.writtenOffAmount));
      const bucket = d.kind === 'BORROWED' ? owe : owed;
      bucket[d.currency] = round2((bucket[d.currency] ?? 0) + rem);
      // Same rule as the list: any late, uncovered pay date makes the debt overdue.
      if (this.serialize(d).overdue) overdue++;
    }
    return { owe, owed, openCount: open.length, overdue };
  }

  /**
   * What Home needs about debts and credits: open totals per currency (with how many are open and overdue
   * and the soonest pay date), and the ones that need attention (overdue, or a pay date within 3 days).
   * Currencies are never mixed.
   */
  async overview(clientId: string, now = new Date()) {
    type Bucket = { amount: number; count: number; overdue: number; nextDueAt: Date | null };
    const rows = await this.prisma.debt.findMany({ where: { clientId, status: 'OPEN', archivedAt: null }, include: { installments: true } });
    const owe: Record<string, Bucket> = {};
    const owed: Record<string, Bucket> = {};
    const attention: Array<{ source: 'DEBT'; debtId: string; kind: string; person: string; currency: string; remaining: number; dueAt: Date; overdue: boolean }> = [];
    const soon = new Date(now.getTime() + 3 * 24 * 60 * 60_000);

    for (const row of rows) {
      const d = this.serialize(row);
      const group = d.kind === 'BORROWED' ? owe : owed;
      const b = (group[d.currency] ??= { amount: 0, count: 0, overdue: 0, nextDueAt: null });
      b.amount = round2(b.amount + d.remaining);
      b.count++;
      if (d.overdue) b.overdue++;
      const due: Date | null = d.nextDueAt ? new Date(d.nextDueAt) : d.dueDate ? new Date(d.dueDate) : null;
      if (due && (!b.nextDueAt || due < b.nextDueAt)) b.nextDueAt = due;
      if (due && (d.overdue || due <= soon)) {
        attention.push({ source: 'DEBT', debtId: d.id, kind: d.kind, person: d.person, currency: d.currency, remaining: d.remaining, dueAt: due, overdue: d.overdue });
      }
    }
    return { owe, owed, attention };
  }

  /** Ledger for the Debt wallet (BORROWED) or Credit wallet (LENT): totals per currency. */
  async ledger(clientId: string, kind?: string) {
    const k = this.kindOf(kind);
    const debts = await this.prisma.debt.findMany({ where: { clientId, kind: k, archivedAt: null } });
    const currencies = buildLedger(debts.map(d => ({
      amount: Number(d.amount),
      paid: Number(d.paid),
      writtenOff: Number(d.writtenOffAmount),
      currency: d.currency,
      status: d.status,
      dueDate: d.dueDate,
    })));
    const sum = (f: (c: (typeof currencies)[number]) => number) => currencies.reduce((s, c) => s + f(c), 0);
    return {
      kind: k,
      currencies,
      debtCount: sum(c => c.debtCount),
      openCount: sum(c => c.openCount),
      settledCount: sum(c => c.settledCount),
      closedOutCount: sum(c => c.closedOutCount),
      overdueCount: sum(c => c.overdueCount),
    };
  }

  /** Every cash movement that belongs to a ledger, newest first. */
  async ledgerTransactions(clientId: string, kind?: string, page = 1, limit = 30) {
    const k = this.kindOf(kind);
    const take = Math.min(Math.max(limit, 1), 100);
    const where: Prisma.TransactionWhereInput = { clientId, debtRole: { in: rolesOf(k) } };
    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({ where, orderBy: { date: 'desc' }, skip: (Math.max(page, 1) - 1) * take, take }),
      this.prisma.transaction.count({ where }),
    ]);
    const ids = [...new Set(rows.map(r => r.debtId).filter((x): x is string => !!x))];
    const debts = ids.length
      ? await this.prisma.debt.findMany({ where: { id: { in: ids } }, select: { id: true, person: true, currency: true, kind: true } })
      : [];
    const byId = new Map(debts.map(d => [d.id, d]));
    return {
      items: rows.map(r => this.mapTx(r, r.debtId ? byId.get(r.debtId) : undefined)),
      total,
      page: Math.max(page, 1),
      limit: take,
    };
  }

  /** Transactions caused by one debt (principal + payments). */
  async transactionsOf(clientId: string, id: string) {
    const d = await this.owned(clientId, id);
    const rows = await this.prisma.transaction.findMany({ where: { clientId, debtId: id }, orderBy: { date: 'desc' } });
    return rows.map(r => this.mapTx(r, { person: d.person, currency: d.currency, kind: d.kind }));
  }

  async create(clientId: string, dto: CreateDebtDto) {
    const amount = Number(dto.amount);
    const kind = this.kindOf(dto.kind);
    if (!dto.person?.trim()) throw new BadRequestException('Enter who the money is with');
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Enter an amount greater than zero');

    // A debt never uses one of my wallets (an old app may still send one: it is ignored).
    const walletId = kind === 'LENT' ? dto.walletId || undefined : undefined;
    let currency = (dto.currency ?? '').toUpperCase();
    if (walletId) {
      const w = await this.prisma.wallet.findFirst({ where: { id: walletId, clientId } });
      if (!w) throw new NotFoundException('Wallet not found');
      currency = w.currency;
    }
    if (!currency) throw new BadRequestException('Choose a currency');
    const date = dto.date ? new Date(dto.date) : new Date();
    const person = dto.person.trim();
    // An estimated payment is only for a loan (money I borrowed). A debt owed to me keeps its single pay dates.
    const wantsPlan = kind === 'BORROWED' && (dto.planAmount != null || dto.planRepeat != null);
    const plan = wantsPlan ? await this.readPlan(clientId, { amount: dto.planAmount, rule: dto.planRepeat, startAt: dto.dueDate, timezone: dto.planTimezone }, amount) : null;

    const debt = await this.prisma.$transaction(async prx => {
      const d = await prx.debt.create({
        data: {
          clientId, kind, person, phone: dto.phone?.trim() || null, amount, currency, date,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null, note: dto.note?.trim() || null, walletId: walletId ?? null,
          // A debt (I owe) reminds by default; a credit only when asked.
          remindersOn: dto.remind ?? kind === 'BORROWED',
          ...(plan ? { planAmount: plan.amount, planRepeat: plan.rule as any, planStartAt: plan.startAt, planTimezone: plan.timezone } : {}),
        },
      });
      if (dto.dueDate) {
        // With a plan, the first pay date already says how much: the plan adds the dates after it.
        await prx.debtInstallment.create({ data: { debtId: d.id, dueAt: new Date(dto.dueDate), plannedAmount: plan ? round2(Math.min(plan.amount, amount)) : null } });
      }
      // Always recorded: borrowing is money in (never counted as income in totals), lending is money out.
      const principalTransactionId = await this.move(prx, clientId, {
        debtId: d.id, walletId: walletId ?? null, amount, date, note: d.note,
        direction: directionFor(kind, 'principal'),
        role: roleFor(kind, 'principal'),
        title: kind === 'BORROWED' ? `Borrowed from ${person}` : `Lent to ${person}`,
      });
      await prx.debt.update({ where: { id: d.id }, data: { principalTransactionId } });
      return d;
    });
    return this.finish(clientId, debt.id);
  }

  async update(clientId: string, id: string, dto: UpdateDebtDto) {
    const d = await this.owned(clientId, id);
    const oldAmount = Number(d.amount);
    const paid = Number(d.paid);
    const writtenOff = Number(d.writtenOffAmount);
    const amount = dto.amount !== undefined ? round2(Number(dto.amount)) : undefined;
    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0 || amount < round2(paid + writtenOff))) {
      throw new BadRequestException('Amount cannot be less than what was already paid or written off');
    }

    // Setting, changing or stopping the estimated payment (loans only).
    const planTouched = dto.planAmount !== undefined || dto.planRepeat !== undefined || dto.planStartAt !== undefined;
    const stopPlan = dto.planAmount === null || dto.planRepeat === null;
    let planData: Prisma.DebtUpdateInput = {};
    let planStartRow: { at: Date; planned: number } | null = null;
    if (planTouched) {
      if (d.kind !== 'BORROWED') throw new BadRequestException('An estimated payment is only for a loan you borrowed');
      if (stopPlan) {
        planData = { planAmount: null, planRepeat: Prisma.JsonNull, planStartAt: null, planTimezone: null };
      } else {
        if (d.status !== 'OPEN' || d.archivedAt) throw new BadRequestException(`This ${nounOf(d.kind)} is closed`);
        const loanAmount = amount ?? Number(d.amount);
        const firstOpen = (d.installments ?? []).filter(i => i.status === 'PENDING').sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0];
        const startAt = dto.planStartAt ?? d.planStartAt ?? firstOpen?.dueAt ?? d.dueDate ?? null;
        const next = await this.readPlan(clientId, {
          amount: dto.planAmount ?? (d.planAmount == null ? undefined : Number(d.planAmount)),
          rule: dto.planRepeat ?? d.planRepeat,
          startAt, timezone: dto.planTimezone ?? d.planTimezone ?? undefined,
        }, loanAmount);
        planData = { planAmount: next.amount, planRepeat: next.rule as any, planStartAt: next.startAt, planTimezone: next.timezone };
        planStartRow = { at: next.startAt, planned: round2(Math.min(next.amount, remainingOf(loanAmount, paid, writtenOff))) };
      }
    }

    await this.prisma.$transaction(async prx => {
      // The plan counts its repeats from a first pay date: make sure that date exists and says how much it asks.
      if (planStartRow) {
        const same = (d.installments ?? []).find(i => i.dueAt.getTime() === planStartRow!.at.getTime());
        if (!same) await prx.debtInstallment.create({ data: { debtId: id, dueAt: planStartRow.at, plannedAmount: planStartRow.planned } });
        else if (same.status === 'PENDING' && same.plannedAmount == null) await prx.debtInstallment.update({ where: { id: same.id }, data: { plannedAmount: planStartRow.planned } });
      }
      // Changing the amount also corrects the original cash movement, so debt and wallet never drift.
      if (amount !== undefined && amount !== oldAmount && d.principalTransactionId) {
        const principal = await prx.transaction.findUnique({ where: { id: d.principalTransactionId } });
        if (principal) {
          const delta = round2(amount - oldAmount);
          await prx.transaction.update({ where: { id: principal.id }, data: { amount } });
          if (principal.walletId) {
            const into = directionFor(d.kind, 'principal') === 'in';
            await prx.wallet.updateMany({
              where: { id: principal.walletId },
              data: { balance: into ? { increment: delta } : { decrement: delta } },
            });
          }
        }
      }
      // A due date sent here only seeds the first pay date; later dates are added, moved or skipped one by one.
      if (dto.dueDate && !(await prx.debtInstallment.count({ where: { debtId: id, status: 'PENDING' } }))) {
        await prx.debtInstallment.create({ data: { debtId: id, dueAt: new Date(dto.dueDate), plannedAmount: null } });
        await this.syncDeadline(prx, id);
      }
      await prx.debt.update({
        where: { id },
        data: {
          ...(dto.person !== undefined ? { person: dto.person.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
          ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
          ...(dto.remindersOn !== undefined ? { remindersOn: !!dto.remindersOn } : {}),
          ...planData,
          ...(amount !== undefined
            ? { amount, status: statusFor({ kind: d.kind, amount, paid, writtenOff, current: d.status }) }
            : {}),
        },
      });
    });
    return this.finish(clientId, id);
  }

  async addPayment(clientId: string, id: string, dto: DebtPaymentDto) {
    const d = await this.owned(clientId, id);
    const remaining = remainingOf(Number(d.amount), Number(d.paid), Number(d.writtenOffAmount));
    const amount = round2(Number(dto.amount));
    if (d.status !== 'OPEN' || remaining <= 0) throw new BadRequestException(`This ${nounOf(d.kind)} is already closed`);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Enter an amount greater than zero');
    if (amount > remaining) throw new BadRequestException(`Only ${remaining} ${d.currency} is left to pay`);
    // Paying a debt never touches my wallets; a credit repaid to me goes into the wallet I chose (or none).
    const walletId = d.kind === 'LENT' ? dto.walletId || undefined : undefined;
    if (walletId) await this.wallet(clientId, walletId, d.currency);
    const date = dto.date ? new Date(dto.date) : new Date();

    const result = await this.prisma.$transaction(async prx => {
      // Always recorded: repaying what I borrowed is money out, being repaid is money in.
      const transactionId = await this.move(prx, clientId, {
        debtId: d.id, walletId: walletId ?? null, amount, date, note: dto.note,
        direction: directionFor(d.kind, 'payment'),
        role: roleFor(d.kind, 'payment'),
        title: d.kind === 'BORROWED' ? `Repaid ${d.person}` : `Repayment from ${d.person}`,
      });
      await prx.debtPayment.create({
        data: { debtId: d.id, amount, date, walletId: walletId ?? null, transactionId, note: dto.note?.trim() || null },
      });
      return this.recompute(prx, d.id);
    });

    if (result.status === 'SETTLED' && result.previous === 'OPEN') {
      this.notifications.notify(clientId, `${capitalNoun(d.kind)} settled`,
        d.kind === 'BORROWED' ? `You've fully repaid ${d.person}.` : `${d.person} has fully repaid you.`, 'transaction');
    }
    return this.finish(clientId, id);
  }

  async removePayment(clientId: string, id: string, paymentId: string) {
    const d = await this.owned(clientId, id);
    const p = d.payments.find(x => x.id === paymentId);
    if (!p) throw new NotFoundException('Payment not found');
    await this.prisma.$transaction(async prx => {
      if (p.transactionId) await this.unmove(prx, p.transactionId);
      await prx.debtPayment.delete({ where: { id: p.id } });
      await this.recompute(prx, d.id);
    });
    return this.finish(clientId, id);
  }

  /** Give up (credit) or have forgiven (debt) whatever is still unpaid. No cash moves. */
  async writeOff(clientId: string, id: string) {
    const d = await this.owned(clientId, id);
    const remaining = remainingOf(Number(d.amount), Number(d.paid), Number(d.writtenOffAmount));
    if (d.status !== 'OPEN' || remaining <= 0) throw new BadRequestException('There is nothing left to write off');
    const writtenOff = round2(Number(d.writtenOffAmount) + remaining);
    const status = statusFor({ kind: d.kind, amount: Number(d.amount), paid: Number(d.paid), writtenOff, current: d.status });
    await this.prisma.$transaction(async prx => {
      await prx.debt.update({ where: { id }, data: { writtenOffAmount: writtenOff, status } });
      // Nothing is owed any more, so pay dates that were never met stop counting. They stay in the history.
      const rows = await prx.debtInstallment.findMany({ where: { debtId: id, status: 'PENDING' } });
      const derived = deriveInstallments({
        amount: Number(d.amount), writtenOff, paid: Number(d.paid), now: new Date(),
        installments: rows.map(r => ({ id: r.id, dueAt: r.dueAt, plannedAmount: r.plannedAmount == null ? null : Number(r.plannedAmount), status: r.status })),
      });
      const unmet = derived.filter(x => x.view !== 'PAID').map(x => x.id);
      if (unmet.length) await prx.debtInstallment.updateMany({ where: { id: { in: unmet } }, data: { status: 'SKIPPED' } });
    });
    return this.finish(clientId, id);
  }

  /** Undo a write-off / forgiveness. */
  async reopen(clientId: string, id: string) {
    const d = await this.owned(clientId, id);
    if (d.status !== 'WRITTEN_OFF' && d.status !== 'FORGIVEN') throw new BadRequestException('Only a written-off or forgiven record can be reopened');
    const status = statusFor({ kind: d.kind, amount: Number(d.amount), paid: Number(d.paid), writtenOff: 0, current: 'OPEN' });
    await this.prisma.debt.update({ where: { id }, data: { writtenOffAmount: 0, status } });
    return this.finish(clientId, id);
  }

  /** Hide a debt without touching any money. Reversible. */
  async archive(clientId: string, id: string) {
    const d = await this.owned(clientId, id);
    if (!d.archivedAt) await this.prisma.debt.update({ where: { id }, data: { archivedAt: new Date() } });
    return this.finish(clientId, id);
  }

  async restore(clientId: string, id: string) {
    await this.owned(clientId, id);
    await this.prisma.debt.update({ where: { id }, data: { archivedAt: null } });
    return this.finish(clientId, id);
  }

  /** Add one more pay date. Earlier ones are untouched. */
  async addInstallment(clientId: string, id: string, dto: InstallmentDto) {
    const d = await this.owned(clientId, id);
    this.assertEditable(d);
    const dueAt = this.validDate(dto.dueAt);
    const planned = dto.plannedAmount == null ? null : round2(Number(dto.plannedAmount));
    const remaining = remainingOf(Number(d.amount), Number(d.paid), Number(d.writtenOffAmount));
    if (planned !== null && (!Number.isFinite(planned) || planned <= 0)) throw new BadRequestException('Enter a planned amount greater than zero');
    if (planned !== null && planned > remaining) throw new BadRequestException(`Only ${remaining} ${d.currency} is left to pay`);
    await this.prisma.$transaction(async prx => {
      await prx.debtInstallment.create({ data: { debtId: id, dueAt, plannedAmount: planned, note: dto.note?.trim() || null } });
      await this.syncDeadline(prx, id);
    });
    return this.finish(clientId, id);
  }

  private async openInstallment(clientId: string, id: string, installmentId: string) {
    const d = await this.owned(clientId, id);
    this.assertEditable(d);
    const row = d.installments.find(i => i.id === installmentId);
    if (!row) throw new NotFoundException('Pay date not found');
    if (row.status !== 'PENDING') throw new BadRequestException('That pay date was already moved or skipped');
    const view = this.serialize(d).installments.find((i: any) => i.id === installmentId)?.view;
    if (view === 'PAID') throw new BadRequestException('That pay date is already paid');
    return { d, row };
  }

  /** Move a pay date: the old one stays in the history as MOVED and a new one is added. */
  async moveInstallment(clientId: string, id: string, installmentId: string, dto: InstallmentDto) {
    const { row } = await this.openInstallment(clientId, id, installmentId);
    const dueAt = this.validDate(dto.dueAt);
    await this.prisma.$transaction(async prx => {
      await prx.debtInstallment.update({ where: { id: row.id }, data: { status: 'MOVED' } });
      await prx.debtInstallment.create({
        data: { debtId: id, dueAt, plannedAmount: row.plannedAmount, movedFromId: row.id, note: row.note },
      });
      await this.syncDeadline(prx, id);
    });
    return this.finish(clientId, id);
  }

  async skipInstallment(clientId: string, id: string, installmentId: string) {
    const { row } = await this.openInstallment(clientId, id, installmentId);
    await this.prisma.$transaction(async prx => {
      await prx.debtInstallment.update({ where: { id: row.id }, data: { status: 'SKIPPED' } });
      await this.syncDeadline(prx, id);
    });
    return this.finish(clientId, id);
  }

  /** Delete a debt and undo every wallet movement it caused. */
  async remove(clientId: string, id: string) {
    await this.owned(clientId, id);
    await this.prisma.$transaction(async prx => {
      const txns = await prx.transaction.findMany({ where: { clientId, debtId: id }, select: { id: true } });
      for (const t of txns) await this.unmove(prx, t.id);
      await prx.debt.delete({ where: { id } });
    });
    return { success: true };
  }
}
