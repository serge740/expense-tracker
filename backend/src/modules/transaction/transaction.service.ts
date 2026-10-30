import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Period, dateFilter } from '../../common/utils/period';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { CategorySlug, Prisma, TransactionType } from '../../../generated/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { NO_DEBT_FLOWS, parseIncludeLoans } from '../../common/utils/loan-filter';
import { parseView, viewFilter } from '../../common/utils/feed-view';
import { canonicalCategory, normalizeSubCategory } from '../../common/utils/categories';
import { rememberSubCategory } from '../../common/utils/subcategory';
import { Scope, assertCanEditTransaction, assertScopeCan, isFamily, personalScope, scopeData, scopeKeyOf, scopeWhere } from '../family/scope/scope';
import { displayName } from '../family/family.service';
import { diffFields, recordActivity } from '../activity/activity';
import { errors } from '../family/family-errors';

/** Who wrote each row of a family list, and which one is the person asking (so the app can show "you" and know what they may edit). */
interface Authors { names: Map<string, string>; me: string }

/** The only fields an edit can change. */
const EDITABLE = ['type', 'category', 'title', 'subCategory', 'description', 'amount', 'date', 'walletId', 'receiptUrl', 'receiptReportUrl'] as const;

/** MySQL can still abort one of several writers that touch the same wallet at the same moment; the right answer is to run it again. */
export async function retryOnConflict<T>(run: () => Promise<T>, tries = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await run(); }
    catch (e: any) {
      if (e?.code !== 'P2034' || attempt >= tries) throw e;
      await new Promise(r => setTimeout(r, 15 * attempt + Math.random() * 40));
    }
  }
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

@Injectable()
export class TransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(scope: Scope, query: QueryTransactionDto) {
    const { type, category, walletId, month, year, startDate, endDate, page = 1, limit = 20, search, view, includeLoans } = query;

    // Transfers only appear when asked for: older screens treat non-income as spending.
    const where: Prisma.TransactionWhereInput = { ...scopeWhere(scope), type: { notIn: ['TRANSFER', 'DEBT'] } };
    if (isFamily(scope) && query.memberId) where.clientId = query.memberId;       // "only what Grace added"
    if (type === 'income')   where.type = 'INCOME';
    if (type === 'expense')  where.type = 'EXPENSE';
    if (type === 'transfer') where.type = 'TRANSFER';
    // The chip is combined with AND so it can never clash with the other filters (or the search's OR).
    const chip = parseView(view);
    if (chip !== 'all' || includeLoans !== undefined) where.AND = [viewFilter(chip, parseIncludeLoans(includeLoans))];
    if (category)  where.category = category as CategorySlug;
    if (walletId)  where.walletId = walletId;
    if (startDate || endDate) {
      where.date = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate   ? { lte: new Date(endDate)   } : {}),
      };
    } else if (month && year) {
      where.date = { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
    }
    if (search) {
      where.OR = [
        { title:       { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    const authors = await this.authorsOf(scope, data);
    return { data: data.map(t => this.mapTx(t, authors)), total, page, limit };
  }

  /** The latest rows; with a period, the latest rows inside it (Home follows its period picker). */
  async findRecent(scope: Scope, limit = 3, view?: string, includeLoans?: string, period: Period | null = null) {
    const chip = parseView(view);
    const txns = await this.prisma.transaction.findMany({
      where: {
        ...scopeWhere(scope), type: { notIn: ['TRANSFER', 'DEBT'] },
        ...(period ? { date: dateFilter(period) } : {}),
        ...(chip !== 'all' || includeLoans !== undefined ? { AND: [viewFilter(chip, parseIncludeLoans(includeLoans))] } : {}),
      },
      orderBy: { date: 'desc' },
      take: limit,
    });
    const authors = await this.authorsOf(scope, txns);
    return txns.map(t => this.mapTx(t, authors));
  }

  async history(scope: Scope, query: QueryTransactionDto) {
    const { category, month, year, startDate, endDate, search, view, includeLoans } = query;
    const where: Prisma.TransactionWhereInput = { ...scopeWhere(scope), type: { notIn: ['TRANSFER', 'DEBT'] } };
    if (isFamily(scope) && query.memberId) where.clientId = query.memberId;
    const chip = parseView(view);
    if (chip !== 'all' || includeLoans !== undefined) where.AND = [viewFilter(chip, parseIncludeLoans(includeLoans))];

    if (category) where.category = category as CategorySlug;
    if (startDate || endDate) {
      where.date = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate   ? { lte: new Date(endDate)   } : {}),
      };
    } else if (month && year) {
      where.date = { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
    }
    if (search) {
      where.OR = [
        { title:       { contains: search } },
        { description: { contains: search } },
      ];
    }

    const txns = await this.prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const authors = await this.authorsOf(scope, txns);
    const groupMap = new Map<string, ReturnType<typeof this.mapTx>[]>();

    for (const t of txns) {
      const d = new Date(t.date);
      let label: string;
      if (d.toDateString() === today.toDateString()) {
        label = 'TODAY';
      } else if (d.toDateString() === yesterday.toDateString()) {
        label = 'YESTERDAY';
      } else {
        const weekday = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
        const mon = MONTH_NAMES[d.getMonth()].toUpperCase();
        label = `${weekday}, ${mon} ${d.getDate()}`;
      }

      if (!groupMap.has(label)) groupMap.set(label, []);
      groupMap.get(label)!.push(this.mapTx(t, authors));
    }

    return Array.from(groupMap.entries()).map(([date, items]) => ({ date, items }));
  }

  /**
   * Creates the transaction and moves the wallet, inside a database transaction the caller owns.
   * Scheduled posting uses this so the transaction and its occurrence change together or not at all.
   */
  async createInTx(
    prx: Prisma.TransactionClient,
    who: string | Scope,
    dto: CreateTransactionDto,
    extra: { scheduledOccurrenceId?: string } = {},
  ) {
    // Scheduled posting still passes a plain client id: that is always the person's own (personal) space.
    const scope = typeof who === 'string' ? personalScope(who) : who;
    const clientId = scope.clientId;
    assertScopeCan(scope, 'tx.add');
    const amount = Math.abs(dto.amount);
    const date = dto.date ? new Date(dto.date) : new Date();
    // An older app may still send a retired category: it becomes the new one (groceries -> Food, "Groceries").
    const canon = canonicalCategory(dto.category);
    const category = canon.category as CategorySlug;
    const subCategory = normalizeSubCategory(dto.subCategory) ?? canon.subCategory ?? null;
    if (dto.fundedByDebtId) {
      if (isFamily(scope)) throw errors.personalOnly();            // loans stay personal
      if (dto.type !== 'EXPENSE') throw new BadRequestException('Only an expense can be paid from borrowed money');
      const debt = await prx.debt.findFirst({ where: { id: dto.fundedByDebtId, clientId } });
      if (!debt || debt.kind !== 'BORROWED') throw new BadRequestException('Choose a debt you borrowed');
      if (debt.status !== 'OPEN' || debt.archivedAt) throw new BadRequestException('That debt is closed');
      const unspent = Number(debt.amount) - Number(debt.spent);
      if (amount > unspent + 0.001) throw new BadRequestException(`Only ${unspent} ${debt.currency} of this debt is unspent`);
      dto = { ...dto, walletId: undefined };
      await prx.debt.update({ where: { id: debt.id }, data: { spent: { increment: amount } } });
    }
    // The wallet must be one of this scope's own: never trust an id from the request (it could be someone else's, or a family's).
    if (dto.walletId) await this.assertWalletInScope(prx, scope, dto.walletId);
    // The wallet is changed BEFORE the row is inserted. Inserting first makes MySQL hold a shared lock on the wallet (the
    // foreign key) and then ask for an exclusive one, so two people adding at once deadlock. Taking the exclusive lock first
    // makes them simply queue.
    if (dto.walletId) {
      const delta = new Prisma.Decimal(amount);
      await prx.wallet.update({
        where: { id: dto.walletId },
        data: { balance: dto.type === 'INCOME' ? { increment: delta } : { decrement: delta } },
      });
    }
    const created = await prx.transaction.create({
      data: {
        ...scopeData(scope),
        type: dto.type,
        category,
        title: dto.title,
        subCategory,
        description: dto.description,
        amount,
        date,
        walletId: dto.walletId,
        receiptUrl: dto.receiptUrl,
        receiptReportUrl: dto.receiptReportUrl,
        fundedByDebtId: dto.fundedByDebtId,
        ...extra,
      },
    });

    // What this person typed or picked is offered to them first next time. A scheduled post is not a new choice.
    if (!extra.scheduledOccurrenceId) await rememberSubCategory(prx, clientId, dto.type, category, subCategory);
    await recordActivity(prx, scope, { kind: 'transaction.created', entity: 'transaction', entityId: created.id, title: created.title, amount: amount, changes: extra.scheduledOccurrenceId ? [{ field: 'source', from: null, to: 'scheduled' }] : undefined });

    return created;
  }

  /** The push (and budget alert) a new transaction causes. Never throws. */
  notifyCreated(clientId: string, tx: { type: TransactionType; amount: unknown; title: string; date: Date }) {
    this.notifyNewTransaction(clientId, tx.type, Number(tx.amount), tx.title, tx.date).catch(() => {});
  }

  async create(scope: Scope, dto: CreateTransactionDto) {
    const tx = await retryOnConflict(() => this.prisma.$transaction(prx => this.createInTx(prx, scope, dto)));
    // Personal pushes and budget alerts only. Telling the rest of a family comes with the family notifications (F5).
    if (!isFamily(scope)) this.notifyCreated(scope.clientId, tx);
    const authors = await this.authorsOf(scope, [tx]);
    return this.mapTx(tx, authors);
  }

  /** Push for the new transaction, plus a budget alert when it crosses 80% / 100%. */
  private async notifyNewTransaction(clientId: string, type: TransactionType, amount: number, title: string, date: Date) {
    const money = amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
    this.notifications.notify(
      clientId,
      type === 'INCOME' ? 'Money received' : 'New expense',
      `${type === 'INCOME' ? '+' : '−'}${money} · ${title}`,
      'transaction',
    );
    if (type !== 'EXPENSE') return;

    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const personal = personalScope(clientId);
    const budget = await this.prisma.budget.findUnique({ where: { scopeKey_month_year: { scopeKey: scopeKeyOf(personal), month, year } } });
    const limit = budget ? Number(budget.limit) : 0;
    if (limit <= 0) return;

    const agg = await this.prisma.transaction.aggregate({
      where: { ...scopeWhere(personal), type: 'EXPENSE', date: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) }, ...NO_DEBT_FLOWS },
      _sum: { amount: true },
    });
    const after = Number(agg._sum.amount ?? 0);
    const before = after - amount;
    const pct = (v: number) => (v / limit) * 100;

    if (pct(before) < 100 && pct(after) >= 100) {
      this.notifications.notify(clientId, 'Budget exceeded', `You've spent ${Math.round(pct(after))}% of this month's budget.`, 'transaction');
    } else if (pct(before) < 80 && pct(after) >= 80) {
      this.notifications.notify(clientId, 'Budget almost used', `You've used ${Math.round(pct(after))}% of this month's budget.`, 'transaction');
    }
  }

  async update(scope: Scope, id: string, dto: Partial<CreateTransactionDto>) {
    const existing = await this.assertInScope(scope, id);
    assertCanEditTransaction(scope, existing.clientId);
    if (existing.type === 'DEBT' || existing.debtId) throw new BadRequestException('This was recorded by Debts & loans — change it there.');
    if (existing.fundedByDebtId || dto.fundedByDebtId) throw new BadRequestException('This was paid from borrowed money — delete it and add it again to change it.');
    if (existing.type === 'TRANSFER' || (dto.type as string) === 'TRANSFER') {
      throw new BadRequestException('Transfers cannot be edited. Delete it and make a new transfer.');
    }
    const amount = dto.amount !== undefined ? Math.abs(dto.amount) : undefined;
    const date = dto.date ? new Date(dto.date) : undefined;
    // Only these can change. The request body is never spread into the update: it could name clientId, familyId or debtId.
    const picked: Record<string, unknown> = {};
    for (const k of EDITABLE) if ((dto as Record<string, unknown>)[k] !== undefined) picked[k] = (dto as Record<string, unknown>)[k];

    const updated = await this.prisma.$transaction(async (prx) => {
      if (dto.walletId && dto.walletId !== existing.walletId) await this.assertWalletInScope(prx, scope, dto.walletId);
      // Reverse old balance effect
      if (existing.walletId) {
        const oldDelta = new Prisma.Decimal(Number(existing.amount));
        await prx.wallet.update({
          where: { id: existing.walletId },
          data: {
            balance: existing.type === 'INCOME'
              ? { decrement: oldDelta }
              : { increment: oldDelta },
          },
        });
      }

      const data: Prisma.TransactionUncheckedUpdateInput = { ...picked, amount, date } as Prisma.TransactionUncheckedUpdateInput;
      let finalCategory = existing.category as CategorySlug;
      if (dto.category !== undefined) {
        const canon = canonicalCategory(dto.category);
        finalCategory = canon.category as CategorySlug;
        data.category = finalCategory;
        if (dto.subCategory === undefined && canon.subCategory) data.subCategory = canon.subCategory;
      }
      if (dto.subCategory !== undefined) data.subCategory = normalizeSubCategory(dto.subCategory);
      const result = await prx.transaction.update({ where: { id }, data });
      if (typeof data.subCategory === 'string') await rememberSubCategory(prx, scope.clientId, (dto.type ?? existing.type) as TransactionType, finalCategory, data.subCategory);

      // Apply new balance effect
      const newWalletId = dto.walletId ?? existing.walletId;
      if (newWalletId) {
        const newType = dto.type ?? existing.type;
        const newAmount = new Prisma.Decimal(amount ?? Number(existing.amount));
        await prx.wallet.update({
          where: { id: newWalletId },
          data: {
            balance: newType === 'INCOME'
              ? { increment: newAmount }
              : { decrement: newAmount },
          },
        });
      }

      await recordActivity(prx, scope, { kind: 'transaction.edited', entity: 'transaction', entityId: id, title: result.title, amount: Number(result.amount), changes: diffFields(existing, result, ['title', 'amount', 'category', 'subCategory', 'description', 'walletId', 'date']) });
      return result;
    });

    const authors = await this.authorsOf(scope, [updated]);
    return this.mapTx(updated, authors);
  }

  /** Keeps a copy of the row for 30 days so Undo and Recently deleted can put it back exactly as it was. */
  private async keepInTrash(prx: Prisma.TransactionClient, scope: Scope, t: { id: string; clientId: string; familyId: string | null; walletId: string | null; type: string; title: string; amount: Prisma.Decimal }) {
    const w = t.walletId ? await prx.wallet.findFirst({ where: { id: t.walletId, ...scopeWhere(scope) }, select: { currency: true } }) : null;
    const row = await prx.trashedTransaction.create({
      data: { originalId: t.id, clientId: t.clientId, familyId: t.familyId, scopeKey: scopeKeyOf(scope), deletedById: scope.clientId, snapshot: JSON.parse(JSON.stringify(t)), title: t.title, type: t.type, amount: t.amount, currency: w?.currency ?? null }, select: { id: true },
    });
    return row.id;
  }

  async remove(scope: Scope, id: string) {
    const existing = await this.assertInScope(scope, id);
    assertCanEditTransaction(scope, existing.clientId);

    if (existing.type === 'DEBT' || existing.debtId) throw new BadRequestException('This was recorded by Debts & loans — change it there.');
    let trashId = '';
    if (existing.type === 'TRANSFER') {
      // Undo both sides: money goes back to the source, leaves the destination.
      await this.prisma.$transaction(async (prx) => {
        trashId = await this.keepInTrash(prx, scope, existing);
        await prx.transaction.delete({ where: { id } });
        await recordActivity(prx, scope, { kind: 'transaction.deleted', entity: 'transaction', entityId: id, title: existing.title, amount: Number(existing.amount) });
        if (existing.walletId) {
          await prx.wallet.updateMany({ where: { id: existing.walletId }, data: { balance: { increment: existing.amount } } });
        }
        if (existing.toWalletId) {
          await prx.wallet.updateMany({ where: { id: existing.toWalletId }, data: { balance: { decrement: existing.toAmount ?? existing.amount } } });
        }
      });
      return { success: true, trashId };
    }

    await this.prisma.$transaction(async (prx) => {
      trashId = await this.keepInTrash(prx, scope, existing);
      await prx.transaction.delete({ where: { id } });
      await recordActivity(prx, scope, { kind: 'transaction.deleted', entity: 'transaction', entityId: id, title: existing.title, amount: Number(existing.amount) });
      if (existing.fundedByDebtId) {
        await prx.debt.updateMany({ where: { id: existing.fundedByDebtId }, data: { spent: { decrement: existing.amount } } });
      }

      if (existing.walletId) {
        const delta = new Prisma.Decimal(Number(existing.amount));
        await prx.wallet.update({
          where: { id: existing.walletId },
          data: {
            balance: existing.type === 'INCOME'
              ? { decrement: delta }
              : { increment: delta },
          },
        });
      }
    });

    return { success: true, trashId };
  }

  private mapTx(t: { id: string; clientId?: string; type: TransactionType; category: CategorySlug; title: string; subCategory?: string | null; description: string | null; amount: Prisma.Decimal | number; date: Date; walletId: string | null; receiptUrl: string | null; receiptReportUrl?: string | null; debtId?: string | null; debtRole?: string | null }, authors?: Authors) {
    const raw = Number(t.amount);
    return {
      // In a family every row says who added it; Personal rows are all your own, so nothing is added there.
      ...(authors && t.clientId ? { author: { clientId: t.clientId, name: authors.names.get(t.clientId) ?? 'Former member', isYou: t.clientId === authors.me } } : {}),
      id: t.id,
      type: t.type,
      category: t.category,
      title: t.title,
      subCategory: t.subCategory ?? null,
      description: t.description,
      amount: t.type === 'INCOME' ? raw : -raw,
      date: t.date,
      walletId: t.walletId,
      receiptUrl: t.receiptUrl,
      receiptReportUrl: t.receiptReportUrl ?? null,
      debtId: t.debtId ?? null,
      debtRole: t.debtRole ?? null,
    };
  }

  /** The transaction, if it is in this scope. Never looked up by id alone: someone else's or another family's is "not found". */
  private async assertInScope(scope: Scope, id: string) {
    const t = await this.prisma.transaction.findFirst({ where: { id, ...scopeWhere(scope) } });
    if (!t) throw new NotFoundException('Transaction not found');
    return t;
  }

  /** The wallet must belong to this scope. Asking for your own personal wallet from inside a family says so. */
  private async assertWalletInScope(prx: Prisma.TransactionClient, scope: Scope, walletId: string) {
    const w = await prx.wallet.findFirst({ where: { id: walletId, ...scopeWhere(scope) }, select: { id: true } });
    if (w) return;
    if (isFamily(scope)) {
      const mine = await prx.wallet.findFirst({ where: { id: walletId, clientId: scope.clientId, familyId: null }, select: { id: true } });
      if (mine) throw errors.wrongScope();
    }
    throw errors.walletNotFound();
  }

  /** Names of the people who wrote these rows, for a family only. */
  private async authorsOf(scope: Scope, rows: Array<{ clientId: string }>): Promise<Authors | undefined> {
    if (!isFamily(scope)) return undefined;
    if (!rows.length) return { names: new Map(), me: scope.clientId };
    const ids = [...new Set(rows.map(r => r.clientId))];
    const people = await this.prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } });
    return { names: new Map(people.map(c => [c.id, displayName(c)])), me: scope.clientId };
  }
}
