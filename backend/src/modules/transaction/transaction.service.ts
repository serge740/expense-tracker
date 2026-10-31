import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
import { cleanNote, cleanTags, packTags, unpackTags } from './annotations';

/** Who wrote each row of a family list, and which one is the person asking (so the app can show "you" and know what they may edit). */
interface Authors { names: Map<string, string>; me: string }

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
        tags: packTags(cleanTags(dto.tags)),
        note: cleanNote(dto.note),
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

  /** Set by the approvals service so a member's large family expense can wait for an owner or admin. */
  holdHook?: (scope: Scope, dto: CreateTransactionDto) => Promise<{ pending: true; approvalId: string; title: string; amount: number } | null>;

  async create(scope: Scope, dto: CreateTransactionDto): Promise<any> {
    if (isFamily(scope) && this.holdHook) {
      const held = await this.holdHook(scope, dto);
      if (held) return held;
    }
    const tx = await retryOnConflict(() => this.prisma.$transaction(prx => this.createInTx(prx, scope, dto)));
    // Personal pushes and budget alerts only. Telling the rest of a family comes with the family notifications (F5).
    if (!isFamily(scope)) this.notifyCreated(scope.clientId, tx);
    else { this.notifyFamilyCreated(scope, tx).catch(() => {}); this.checkAllowance(scope, tx).catch(() => {}); }
    const authors = await this.authorsOf(scope, [tx]);
    return this.mapTx(tx, authors);
  }

  /** A member's own monthly allowance: they are told at 80% and when it is passed, and the owner and admins hear when it is passed. Never throws. */
  async checkAllowance(scope: Scope, tx: { type: TransactionType; amount: unknown; date: Date }) {
    if (!isFamily(scope) || tx.type !== 'EXPENSE') return;
    const a = await this.prisma.familyAllowance.findFirst({ where: { familyId: scope.familyId, clientId: scope.clientId } });
    if (!a) return;
    const limit = Number(a.monthlyLimit);
    const month = { gte: new Date(tx.date.getFullYear(), tx.date.getMonth(), 1), lt: new Date(tx.date.getFullYear(), tx.date.getMonth() + 1, 1) };
    const agg = await this.prisma.transaction.aggregate({ where: { familyId: scope.familyId, clientId: scope.clientId, type: 'EXPENSE', date: month, ...NO_DEBT_FLOWS }, _sum: { amount: true } });
    const after = Number(agg._sum.amount ?? 0);
    const before = after - Number(tx.amount);
    if (limit <= 0) return;
    if (before <= limit && after > limit) {
      this.notifications.notify(scope.clientId, 'Allowance passed', `You have spent more than your monthly allowance (${Math.round((after / limit) * 100)}%).`, 'transaction', { familyId: scope.familyId });
      const managers = await this.prisma.familyMember.findMany({ where: { familyId: scope.familyId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } }, select: { clientId: true } });
      const me = await this.prisma.client.findUnique({ where: { id: scope.clientId }, select: { firstName: true, lastName: true } });
      for (const m of managers) if (m.clientId !== scope.clientId) this.notifications.notify(m.clientId, 'Allowance passed', `${me ? displayName(me) : 'A member'} has passed their monthly allowance.`, 'transaction', { familyId: scope.familyId });
    } else if (before / limit < 0.8 && after / limit >= 0.8 && after <= limit) {
      this.notifications.notify(scope.clientId, 'Allowance almost used', `You have used ${Math.round((after / limit) * 100)}% of your monthly allowance.`, 'transaction', { familyId: scope.familyId });
    }
  }

  /**
   * Inside a family: the other active members are told who added what (unless they switched family notifications off), every
   * member's open screens are nudged to refresh, and the family budget alert goes to everyone when it crosses 80% / 100%.
   * Never throws: a failed message must not undo the transaction.
   */
  async notifyFamilyCreated(scope: Scope, tx: { type: TransactionType; amount: unknown; title: string; date: Date; id?: string }) {
    if (!isFamily(scope)) return;
    const members = await this.prisma.familyMember.findMany({ where: { familyId: scope.familyId, status: 'ACTIVE' }, select: { clientId: true } });
    const others = members.map(m => m.clientId).filter(id => id !== scope.clientId);
    for (const id of others) this.notifications.nudge(id, 'family-changed', { familyId: scope.familyId });
    if (!others.length) return;
    const prefs = await this.prisma.notificationPreference.findMany({ where: { clientId: { in: others } }, select: { clientId: true, notifyFamily: true } });
    const off = new Set(prefs.filter(p => !p.notifyFamily).map(p => p.clientId));
    const me = await this.prisma.client.findUnique({ where: { id: scope.clientId }, select: { firstName: true, lastName: true } });
    const who = me ? displayName(me) : 'A member';
    const amount = Number(tx.amount);
    const money = amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
    for (const id of others) {
      if (off.has(id)) continue;
      this.notifications.notify(id, tx.type === 'INCOME' ? 'Family: money in' : 'Family: new expense', `${who} · ${tx.type === 'INCOME' ? '+' : '−'}${money} · ${tx.title}`, 'transaction', { familyId: scope.familyId, transactionId: tx.id });
    }
    if (tx.type !== 'EXPENSE') return;
    const month = tx.date.getMonth() + 1;
    const year = tx.date.getFullYear();
    const budget = await this.prisma.budget.findUnique({ where: { scopeKey_month_year: { scopeKey: scopeKeyOf(scope), month, year } } });
    const limit = budget ? Number(budget.limit) : 0;
    if (limit <= 0) return;
    const agg = await this.prisma.transaction.aggregate({
      where: { ...scopeWhere(scope), type: 'EXPENSE', date: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) }, ...NO_DEBT_FLOWS },
      _sum: { amount: true },
    });
    const after = Number(agg._sum.amount ?? 0);
    const before = after - amount;
    const pct = (v: number) => (v / limit) * 100;
    const crossed = pct(before) < 100 && pct(after) >= 100 ? ['Family budget exceeded', `The family has spent ${Math.round(pct(after))}% of this month's budget.`]
      : pct(before) < 80 && pct(after) >= 80 ? ['Family budget almost used', `The family has used ${Math.round(pct(after))}% of this month's budget.`] : null;
    if (crossed) for (const id of members.map(m => m.clientId)) if (!off.has(id)) this.notifications.notify(id, crossed[0], crossed[1], 'transaction', { familyId: scope.familyId });
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

  /** What an edit may send. `expectedUpdatedAt` is the version the person was looking at: if the row has changed since, the edit is refused instead of overwriting. */
  async update(scope: Scope, id: string, dto: Partial<CreateTransactionDto> & { expectedUpdatedAt?: string }) {
    const existing = await this.assertInScope(scope, id);
    assertCanEditTransaction(scope, existing.clientId);
    if (existing.type === 'TRANSFER' || existing.type === 'DEBT' || (dto.type as string) === 'TRANSFER') {
      throw new BadRequestException('Transfers cannot be edited. Delete it and make a new transfer.');
    }
    if (dto.fundedByDebtId !== undefined) throw new BadRequestException('Which loan paid for this cannot be changed. Delete it and add it again.');
    if (dto.expectedUpdatedAt) {
      const seen = new Date(dto.expectedUpdatedAt);
      if (!Number.isNaN(seen.getTime()) && seen.getTime() !== existing.updatedAt.getTime()) {
        throw new ConflictException('This transaction was changed by someone else a moment ago. Open it again to see the new version.');
      }
    }

    // ── What the person asked for, checked field by field ──
    const funded = !!existing.fundedByDebtId;           // paid out of a borrowed loan's money: no wallet, always an expense
    const isLoanRow = !!existing.debtRole;               // recorded for a loan or debt: keeps its kind and its category
    const data: Prisma.TransactionUncheckedUpdateInput = {};

    let newType = existing.type as TransactionType;
    if (dto.type !== undefined) {
      if (dto.type !== 'INCOME' && dto.type !== 'EXPENSE') throw new BadRequestException('Choose expense or income');
      if (dto.type !== existing.type && (funded || isLoanRow)) throw new BadRequestException(funded ? 'A purchase paid from borrowed money stays an expense.' : 'A loan or debt entry keeps its type.');
      newType = dto.type;
      data.type = newType;
    }

    let newAmount = Number(existing.amount);
    if (dto.amount !== undefined) {
      const n = Math.abs(Number(dto.amount));
      if (!Number.isFinite(n) || n <= 0) throw new BadRequestException('Enter an amount greater than zero');
      if (n > 9_999_999_999) throw new BadRequestException('That amount is too large');
      newAmount = Math.round(n * 100) / 100;
      data.amount = newAmount;
    }

    if (dto.title !== undefined) {
      const title = String(dto.title ?? '').trim();
      if (!title) throw new BadRequestException('Enter a description');
      data.title = title.slice(0, 200);
    }
    if (dto.description !== undefined) data.description = dto.description === null ? null : String(dto.description).trim().slice(0, 2000) || null;

    let finalCategory = existing.category as CategorySlug;
    if (dto.category !== undefined) {
      const canon = canonicalCategory(String(dto.category));
      if (!(Object.values(CategorySlug) as string[]).includes(canon.category)) throw new BadRequestException('Choose a category');
      if (isLoanRow && canon.category !== existing.category) throw new BadRequestException('A loan or debt entry keeps its category.');
      finalCategory = canon.category as CategorySlug;
      data.category = finalCategory;
      // A new category forgets the old sub-category unless one is sent with it.
      data.subCategory = dto.subCategory !== undefined ? normalizeSubCategory(dto.subCategory) : canon.subCategory ?? (finalCategory === existing.category ? existing.subCategory : null);
    } else if (dto.subCategory !== undefined) {
      data.subCategory = normalizeSubCategory(dto.subCategory);
    }

    let newDate = existing.date;
    if (dto.date !== undefined && dto.date !== null && dto.date !== '') {
      const d = new Date(dto.date);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('Choose a valid date');
      // The balance moves now, so a future date belongs in a schedule, not here.
      if (d.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('Choose a date that is not in the future. Use a schedule for payments that are still to come.');
      newDate = d;
      data.date = d;
    }

    // The wallet: not sent = unchanged, null or "" = take it off the wallet, an id = move it there.
    const walletSent = dto.walletId !== undefined;
    const newWalletId: string | null = walletSent ? (dto.walletId || null) : existing.walletId;
    if (funded && newWalletId) throw new BadRequestException('A purchase paid from borrowed money has no wallet.');
    if (walletSent) data.walletId = newWalletId;

    if (dto.receiptUrl !== undefined) data.receiptUrl = dto.receiptUrl || null;
    if (dto.receiptReportUrl !== undefined) data.receiptReportUrl = dto.receiptReportUrl || null;
    if (dto.tags !== undefined) data.tags = packTags(cleanTags(dto.tags));
    if (dto.note !== undefined) data.note = cleanNote(dto.note);

    // A member's expense that was small enough to skip approval cannot be edited into one that needs it.
    if (isFamily(scope) && scope.role === 'MEMBER' && newType === 'EXPENSE' && (newAmount > Number(existing.amount) || existing.type !== 'EXPENSE')) {
      const fam = await this.prisma.family.findUnique({ where: { id: scope.familyId }, select: { approvalThreshold: true } });
      if (fam?.approvalThreshold != null && newAmount > Number(fam.approvalThreshold)) {
        throw new BadRequestException('This amount needs approval from an owner or an admin. Ask one of them to change it, or delete it and send it for approval.');
      }
    }

    // Money a wallet gains (+) or loses (-) from this row.
    const effect = (type: string, amount: number) => (type === 'INCOME' ? amount : -amount);
    const oldEffect = effect(existing.type, Number(existing.amount));
    const newEffect = effect(newType, newAmount);

    const updated = await retryOnConflict(() => this.prisma.$transaction(async (prx) => {
      if (newWalletId && newWalletId !== existing.walletId) {
        await this.assertWalletInScope(prx, scope, newWalletId);
        const w = await prx.wallet.findUnique({ where: { id: newWalletId }, select: { archived: true } });
        if (w?.archived) throw new BadRequestException('That wallet is archived and cannot receive new entries.');
      }

      // One net change per wallet, in id order, so two edits at once can never wait on each other in a circle.
      const changes = new Map<string, number>();
      const add = (walletId: string | null, delta: number) => { if (walletId && delta) changes.set(walletId, Math.round(((changes.get(walletId) ?? 0) + delta) * 100) / 100); };
      add(existing.walletId, -oldEffect);
      add(newWalletId, newEffect);
      for (const [walletId, delta] of [...changes.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
        if (delta) await prx.wallet.updateMany({ where: { id: walletId }, data: { balance: { increment: new Prisma.Decimal(delta) } } });
      }

      // Money spent from a loan: the loan's "spent" follows the amount.
      if (funded && newAmount !== Number(existing.amount)) {
        const delta = Math.round((newAmount - Number(existing.amount)) * 100) / 100;
        const debt = await prx.debt.findUnique({ where: { id: existing.fundedByDebtId! } });
        if (!debt) throw new BadRequestException('The loan this was paid from no longer exists.');
        const unspent = Number(debt.amount) - Number(debt.spent);
        if (delta > unspent + 0.001) throw new BadRequestException(`Only ${unspent} ${debt.currency} of that loan is unspent.`);
        await prx.debt.update({ where: { id: debt.id }, data: { spent: { increment: new Prisma.Decimal(delta) } } });
      }

      const result = await prx.transaction.update({ where: { id }, data });
      if (typeof data.subCategory === 'string') await rememberSubCategory(prx, scope.clientId, newType, finalCategory, data.subCategory);
      const changed = diffFields(existing, result, ['title', 'amount', 'category', 'subCategory', 'description', 'walletId', 'date', 'type']);
      if (changed.length || dto.tags !== undefined || dto.note !== undefined) {
        await recordActivity(prx, scope, { kind: 'transaction.edited', entity: 'transaction', entityId: id, title: result.title, amount: Number(result.amount), changes: changed });
      }
      return result;
    }));
    void newDate;

    const authors = await this.authorsOf(scope, [updated]);
    return this.mapTx(updated, authors);
  }

  /** One transaction as the edit sheet needs it: everything editable, the wallet, the tags and note, and the version (updatedAt) to send back. */
  async findOne(scope: Scope, id: string) {
    const t = await this.assertInScope(scope, id);
    const wallet = t.walletId ? await this.prisma.wallet.findFirst({ where: { id: t.walletId, ...scopeWhere(scope) }, select: { name: true, currency: true, archived: true } }) : null;
    const authors = await this.authorsOf(scope, [t]);
    const mayEdit = (() => { try { assertCanEditTransaction(scope, t.clientId); return true; } catch { return false; } })();
    return {
      ...this.mapTx(t, authors),
      tags: unpackTags(t.tags), note: t.note ?? null,
      updatedAt: t.updatedAt,
      fundedByDebtId: t.fundedByDebtId ?? null,
      wallet: wallet ? { name: wallet.name, currency: wallet.currency, archived: wallet.archived } : null,
      // What the edit sheet may offer for this row.
      edit: { allowed: mayEdit && t.type !== 'TRANSFER' && t.type !== 'DEBT', typeLocked: !!t.debtRole || !!t.fundedByDebtId, categoryLocked: !!t.debtRole, walletLocked: !!t.fundedByDebtId },
    };
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
      // A loan or debt that pointed at this transaction keeps its own record; it just no longer points here.
      if (existing.debtId) {
        await prx.debtPayment.updateMany({ where: { transactionId: id }, data: { transactionId: null } });
        await prx.debt.updateMany({ where: { principalTransactionId: id }, data: { principalTransactionId: null } });
      }
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
      ...((t as { updatedAt?: Date }).updatedAt ? { updatedAt: (t as { updatedAt?: Date }).updatedAt } : {}),
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
