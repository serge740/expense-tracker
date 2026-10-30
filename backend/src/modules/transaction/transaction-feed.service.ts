import { FEED_PAGE_MAX } from './feed';
import { EXPORT_MAX, rowsToCsv, type CsvRow } from './feed-csv';
import { buildXlsx } from './feed-xlsx';
import { buildHistoryPdf } from './feed-pdf';
import { cleanNote, cleanTags, packTags, unpackTags } from './annotations';
import { assertCanEditTransaction, assertScopeCan } from '../family/scope/scope';
import { recordActivity } from '../activity/activity';
import { errors } from '../family/family-errors';
import { parseFeedFilter } from './feed';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { Scope, isFamily, scopeWhere } from '../family/scope/scope';
import { dateFilter, type Period } from '../../common/utils/period';
import { viewFilter } from '../../common/utils/feed-view';
import { ExchangeRateService } from '../wallet/exchange-rate.service';
import {
  FeedFilter, FeedKind, Pick, buildFacets, groupTotals, type GroupTotals, changePercent, decodeCursor, decodeOffset, encodeCursor, encodeOffset, legacyWithSub, previousPeriod, seriesSpan, slugsFor, totalsByCurrency, type SumRow,
} from './feed';
import { LEGACY_CATEGORY } from '../../common/utils/categories';

const num = (v: unknown) => Number(v ?? 0);

/** The lookups a filter needs before it can be turned into a condition. */
interface Prepared { occurrenceIds: string[] | null; duplicateIds: string[] | null }
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The History page's list and totals. The list is paged (newest first) and includes transfers, with everything a row
 * needs to draw itself (wallet, schedule, loan) fetched once per page. The totals cover the whole filter, per currency.
 */
@Injectable()
export class TransactionFeedService {
  constructor(private readonly prisma: PrismaService, private readonly fx: ExchangeRateService) {}

  /** Looked up once per request: the rows a schedule posted, and the possible duplicates. */
  private async prepare(scope: Scope, f: FeedFilter): Promise<Prepared> {
    let occurrenceIds: string[] | null = null;
    if (f.schedules.length || f.schedMode !== 'any') {
      if (isFamily(scope)) occurrenceIds = []; // a family has no schedules
      else {
        const occ = await this.prisma.scheduledOccurrence.findMany({
          where: {
            status: 'POSTED', transactionId: { not: null },
            schedule: { clientId: scope.clientId, ...(f.schedules.length ? { id: { in: f.schedules } } : {}), ...(f.schedMode === 'auto' ? { mode: 'AUTO_POST' } : f.schedMode === 'confirm' ? { mode: 'REMIND_CONFIRM' } : {}) },
          },
          select: { id: true }, take: 5000,
        });
        occurrenceIds = occ.map(o => o.id);
      }
    }
    const duplicateIds = f.flags.includes('duplicates') ? await this.duplicates(scope, f.period, null) : null;
    return { occurrenceIds, duplicateIds };
  }

  /**
   * "Possible duplicate": the same title, amount, wallet and kind within a day of each other. A transfer is never one.
   * Looked at inside the scope only (a family's rows are compared with the family's, a person's with their own).
   */
  async duplicates(scope: Scope, period: Period | null, onlyIds: string[] | null): Promise<string[]> {
    if (onlyIds && onlyIds.length === 0) return [];
    const mine = isFamily(scope) ? Prisma.sql`a.familyId = ${scope.familyId}` : Prisma.sql`a.clientId = ${scope.clientId} AND a.familyId IS NULL`;
    const same = isFamily(scope) ? Prisma.sql`b.familyId = a.familyId` : Prisma.sql`b.clientId = a.clientId AND b.familyId IS NULL`;
    const range = period?.from && period.to ? Prisma.sql` AND a.date >= ${period.from} AND a.date < ${period.to}` : Prisma.empty;
    const only = onlyIds ? Prisma.sql` AND a.id IN (${Prisma.join(onlyIds)})` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT DISTINCT a.id FROM \`Transaction\` a
      JOIN \`Transaction\` b ON a.id <> b.id AND ${same} AND a.type = b.type AND a.amount = b.amount AND a.walletId <=> b.walletId
        AND LOWER(a.title) = LOWER(b.title) AND ABS(TIMESTAMPDIFF(HOUR, a.date, b.date)) <= 24
      WHERE ${mine} AND a.type <> 'TRANSFER' AND a.dupeKept = 0${range}${only}
      LIMIT 2000`);
    return rows.map(r => r.id);
  }

  /** What a category choice matches: the category (with the retired ones that became it), one sub-category, or "no sub-category". */
  private pickWhere(p: Pick): Prisma.TransactionWhereInput {
    const slugs = slugsFor(p.c) as any;
    if (p.s) {
      const legacy = legacyWithSub(p.c, p.s);
      const direct: Prisma.TransactionWhereInput = { category: { in: slugs }, subCategory: p.s };
      return legacy.length ? { OR: [direct, ...legacy.map(k => ({ category: k as any, subCategory: null }))] } : direct;
    }
    if (p.none) {
      // A retired value that names its sub-category (groceries) is not "without one".
      const implied = new Set(Object.entries(LEGACY_CATEGORY).filter(([, v]) => v.subCategory).map(([k]) => k));
      return { category: { in: (slugs as string[]).filter(k => !implied.has(k)) as any }, subCategory: null };
    }
    return { category: { in: slugs } };
  }

  /** The opposite of a choice, written out so rows with no sub-category are not lost (SQL's NOT drops them). */
  private notPick(p: Pick): Prisma.TransactionWhereInput {
    const slugs = slugsFor(p.c) as any;
    if (p.s) {
      const implying = legacyWithSub(p.c, p.s) as any;
      return { OR: [{ category: { notIn: slugs } }, { subCategory: null, category: { notIn: implying } }, { subCategory: { not: p.s } }] };
    }
    if (p.none) return { OR: [{ category: { notIn: slugs } }, { subCategory: { not: null } }] };
    return { category: { notIn: slugs } };
  }

  private kindWhere(kind: FeedKind, includeLoans: boolean): Prisma.TransactionWhereInput {
    return kind === 'transfer' ? { type: 'TRANSFER', ...(includeLoans ? {} : { debtRole: null }) } : viewFilter(kind, includeLoans);
  }

  /** One place that turns a filter into a database condition, shared by the list, the totals and the counts. The scope is added by each query itself. */
  private conditions(scope: Scope, f: FeedFilter, pre: Prepared, period: Period | null = f.period): Prisma.TransactionWhereInput {
    const and: Prisma.TransactionWhereInput[] = [];
    and.push(f.kinds.length ? { OR: f.kinds.map(k => this.kindWhere(k, f.includeLoans)) } : viewFilter('all', f.includeLoans));
    if (f.walletIds.length) and.push({ OR: [{ walletId: { in: f.walletIds } }, { toWalletId: { in: f.walletIds } }] });
    if (f.search) {
      const or: Prisma.TransactionWhereInput[] = [
        { title: { contains: f.search } }, { description: { contains: f.search } }, { subCategory: { contains: f.search } }, { wallet: { name: { contains: f.search } } }, { note: { contains: f.search } }, { tags: { contains: f.search } },
      ];
      if (/^\d+(\.\d{1,2})?$/.test(f.search)) or.push({ amount: Number(f.search) });
      and.push({ OR: or });
    }
    if (f.tags.length) and.push({ OR: f.tags.map(t => ({ tags: { contains: `|${t}|` } })) });
    if (f.include.length) and.push({ OR: f.include.map(p => this.pickWhere(p)) });
    for (const p of f.exclude) and.push(this.notPick(p));
    if (f.minAmount !== null || f.maxAmount !== null) and.push({ amount: { ...(f.minAmount !== null ? { gte: f.minAmount } : {}), ...(f.maxAmount !== null ? { lte: f.maxAmount } : {}) } });
    if (f.receipt === 'with') and.push({ receiptUrl: { not: null } });
    if (f.receipt === 'without') and.push({ receiptUrl: null });
    if (f.source === 'schedule') and.push({ scheduledOccurrenceId: { not: null } });
    if (f.source === 'hand') and.push({ scheduledOccurrenceId: null, debtId: null, type: { not: 'TRANSFER' } });
    if (f.source === 'debt') and.push({ debtId: { not: null } });
    if (f.source === 'transfer') and.push({ type: 'TRANSFER' });
    if (pre.occurrenceIds) and.push({ scheduledOccurrenceId: { in: pre.occurrenceIds.length ? pre.occurrenceIds : ['none'] } });
    if (pre.duplicateIds) and.push({ id: { in: pre.duplicateIds.length ? pre.duplicateIds : ['none'] } });
    if (f.flags.includes('uncategorised')) and.push({ category: 'other', subCategory: null, type: { not: 'TRANSFER' }, debtRole: null });
    return {
      type: { not: 'DEBT' },
      ...(isFamily(scope) && f.memberId ? { clientId: f.memberId } : {}),
      ...(period ? { date: dateFilter(period) } : {}),
      AND: and,
    };
  }

  /** Every row of the filter (up to a cap) as a CSV: what is on screen, not more. */
  async exportCsv(scope: Scope, f: FeedFilter) {
    const { rows, truncated } = await this.exportRows(scope, f);
    return { csv: rowsToCsv(rows), count: rows.length, truncated };
  }

  /** The same rows as a spreadsheet (.xlsx) or a printable PDF, as base64 so the page can save them. */
  async exportFile(scope: Scope, f: FeedFilter, format: 'xlsx' | 'pdf') {
    const { rows, truncated } = await this.exportRows(scope, f);
    const stamp = new Date().toISOString().slice(0, 10);
    const buf = format === 'xlsx'
      ? buildXlsx('History', ['Date', 'Type', 'Title', 'Category', 'Subcategory', 'Amount', 'Currency', 'Wallet', 'To wallet', 'Note', 'Tags', 'Private note'],
        rows.map(r => [new Date(r.date).toISOString().slice(0, 10), r.type, r.title, r.category, r.subCategory, r.amount, r.currency, r.wallet?.name, r.transfer?.toWallet?.name, r.description, (r.tags ?? []).join(' '), r.note]))
      : await buildHistoryPdf(rows, { title: 'History', subtitle: `${rows.length} rows · exported ${stamp}`, truncated });
    return { filename: `history-${stamp}.${format}`, base64: buf.toString('base64'), count: rows.length, truncated };
  }

  private async exportRows(scope: Scope, f: FeedFilter): Promise<{ rows: CsvRow[]; truncated: boolean }> {
    const rows: CsvRow[] = [];
    let cursor: string | null = null;
    let truncated = false;
    for (;;) {
      const page: { items: CsvRow[]; nextCursor: string | null } = await this.feed(scope, { ...f, limit: FEED_PAGE_MAX, cursor });
      rows.push(...page.items);
      if (!page.nextCursor) break;
      if (rows.length >= EXPORT_MAX) { truncated = true; break; }
      cursor = page.nextCursor;
    }
    return { rows: rows.slice(0, EXPORT_MAX), truncated };
  }

  // ── Tags and notes ─────────────────────────────────────────────────────────

  /** The tags in use in this space, most used first. */
  async tagsInUse(scope: Scope) {
    const rows = await this.prisma.transaction.findMany({ where: { ...scopeWhere(scope), tags: { not: null } }, select: { tags: true }, take: 5000 });
    const counts = new Map<string, { tag: string; count: number }>();
    for (const r of rows) for (const t of unpackTags(r.tags)) {
      const key = t.toLowerCase();
      const c = counts.get(key) ?? { tag: t, count: 0 };
      c.count++; counts.set(key, c);
    }
    return { items: [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, 100) };
  }

  /** The tags and note of one row (the detail screen asks for them). */
  async annotation(scope: Scope, id: string) {
    const t = await this.prisma.transaction.findFirst({ where: { id, ...scopeWhere(scope) }, select: { id: true, tags: true, note: true } });
    if (!t) throw errors.notFound();
    return { id: t.id, tags: unpackTags(t.tags), note: t.note ?? null };
  }

  /** Sets the tags and / or the private note of one row. Allowed on any row the person may edit, including loan and transfer rows (no money moves). */
  async annotate(scope: Scope, id: string, dto: { tags?: unknown; note?: unknown }) {
    const t = await this.prisma.transaction.findFirst({ where: { id, ...scopeWhere(scope) } });
    if (!t) throw errors.notFound();
    assertCanEditTransaction(scope, t.clientId);
    const data: { tags?: string | null; note?: string | null } = {};
    const changes: Array<{ field: string; from: string | null; to: string | null }> = [];
    if (dto.tags !== undefined) { data.tags = packTags(cleanTags(dto.tags)); changes.push({ field: 'tags', from: unpackTags(t.tags).join(' ') || null, to: unpackTags(data.tags).join(' ') || null }); }
    if (dto.note !== undefined) { data.note = cleanNote(dto.note); changes.push({ field: 'note', from: t.note ? 'set' : null, to: data.note ? 'set' : null }); }
    const out = await this.prisma.transaction.update({ where: { id }, data });
    await recordActivity(this.prisma as never, scope, { kind: 'transaction.edited', entity: 'transaction', entityId: id, title: t.title, amount: Number(t.amount), changes });
    return { id, tags: unpackTags(out.tags), note: out.note ?? null };
  }

  // ── Possible duplicates, side by side ──────────────────────────────────────

  /** Groups of rows that look like the same payment entered twice (same title, amount, wallet and kind, a day apart at most). */
  async duplicateGroups(scope: Scope) {
    const f = parseFeedFilter({ all: 'true', flags: 'duplicates', sort: 'oldest', limit: '200' } as never);
    const page = await this.feed(scope, f);
    const key = (r: any) => [String(r.title).toLowerCase(), r.amount, r.walletId ?? '', r.type].join('|');
    const byKey = new Map<string, any[]>();
    for (const r of page.items as any[]) byKey.set(key(r), [...(byKey.get(key(r)) ?? []), r]);
    const groups: Array<{ id: string; rows: any[] }> = [];
    for (const list of byKey.values()) {
      let run: any[] = [];
      for (const r of list) {
        if (run.length && new Date(r.date).getTime() - new Date(run[run.length - 1].date).getTime() > 24 * 3_600_000) { if (run.length > 1) groups.push({ id: run[0].id, rows: run }); run = []; }
        run.push(r);
      }
      if (run.length > 1) groups.push({ id: run[0].id, rows: run });
    }
    groups.sort((a, b) => new Date(b.rows[0].date).getTime() - new Date(a.rows[0].date).getTime());
    return { groups, truncated: !!page.nextCursor };
  }

  /** "These are not duplicates": the rows stop being flagged. */
  async keepDuplicates(scope: Scope, ids: unknown) {
    assertScopeCan(scope, 'tx.edit.own');
    const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && /^[\w-]{1,64}$/.test(x)).slice(0, 50) : [];
    if (!list.length) throw errors.invalid('Choose the rows to keep');
    const r = await this.prisma.transaction.updateMany({ where: { id: { in: list }, ...scopeWhere(scope) }, data: { dupeKept: true } });
    return { kept: r.count };
  }

  async feed(scope: Scope, f: FeedFilter) {
    const pre = await this.prepare(scope, f);
    const groupOrder = f.groupBy === 'category' ? [{ category: 'asc' as const }] : f.groupBy === 'wallet' ? [{ wallet: { name: 'asc' as const } }] : f.groupBy === 'member' ? [{ clientId: 'asc' as const }] : f.groupBy === 'title' ? [{ title: 'asc' as const }] : null;
    // Date sorts page by "after this row"; amount sorts and group orderings page by position (the same amount or group can repeat).
    const byDate = (f.sort === 'newest' || f.sort === 'oldest') && !groupOrder;
    const dir = f.sort === 'newest' || f.sort === 'largest' ? 'desc' : 'asc';
    const dateDir = f.sort === 'oldest' ? 'asc' : 'desc';
    const cursor = byDate ? decodeCursor(f.cursor) : null;
    const offset = byDate ? 0 : decodeOffset(f.cursor);
    const after: Prisma.TransactionWhereInput[] = cursor
      ? [{ OR: dir === 'desc' ? [{ date: { lt: cursor.date } }, { date: cursor.date, id: { lt: cursor.id } }] : [{ date: { gt: cursor.date } }, { date: cursor.date, id: { gt: cursor.id } }] }]
      : [];
    const found = await this.prisma.transaction.findMany({
      where: { AND: [{ ...scopeWhere(scope), ...this.conditions(scope, f, pre) }, ...after] },
      orderBy: groupOrder ? [...groupOrder, { date: dateDir }, { id: dateDir }] : byDate ? [{ date: dir }, { id: dir }] : [{ amount: dir }, { id: dir }],
      ...(offset ? { skip: offset } : {}),
      take: f.limit + 1,
    });
    const hasMore = found.length > f.limit;
    const rows = hasMore ? found.slice(0, f.limit) : found;

    const dupes = new Set(await this.duplicates(scope, null, rows.filter(r => r.type !== 'TRANSFER').map(r => r.id)));
    const walletIds = [...new Set(rows.flatMap(r => [r.walletId, r.toWalletId]).filter((x): x is string => !!x))];
    const occurrenceIds = rows.map(r => r.scheduledOccurrenceId).filter((x): x is string => !!x);
    const debtIds = [...new Set(rows.flatMap(r => [r.debtId, r.fundedByDebtId]).filter((x): x is string => !!x))];
    const [wallets, occurrences, debts, authors] = await Promise.all([
      walletIds.length ? this.prisma.wallet.findMany({ where: { id: { in: walletIds }, ...scopeWhere(scope) }, select: { id: true, name: true, color: true, currency: true, archived: true } }) : [],
      occurrenceIds.length ? this.prisma.scheduledOccurrence.findMany({ where: { id: { in: occurrenceIds } }, select: { id: true, scheduleId: true, schedule: { select: { title: true, repeat: true, mode: true, status: true } } } }) : [],
      debtIds.length && !isFamily(scope)
        ? this.prisma.debt.findMany({ where: { id: { in: debtIds }, clientId: scope.clientId }, select: { id: true, kind: true, person: true, amount: true, paid: true, currency: true, status: true, _count: { select: { payments: true, installments: true } } } })
        : [],
      this.authors(scope, rows),
    ]);
    const walletById = new Map(wallets.map(w => [w.id, w] as const));
    const occById = new Map(occurrences.map(o => [o.id, o] as const));
    const debtById = new Map(debts.map(d => [d.id, d] as const));

    const items = rows.map(t => {
      const w = t.walletId ? walletById.get(t.walletId) : undefined;
      const to = t.toWalletId ? walletById.get(t.toWalletId) : undefined;
      const occ = t.scheduledOccurrenceId ? occById.get(t.scheduledOccurrenceId) : undefined;
      const debt = t.debtId ? debtById.get(t.debtId) : undefined;
      const funded = t.fundedByDebtId ? debtById.get(t.fundedByDebtId) : undefined;
      const raw = num(t.amount);
      return {
        ...(authors && t.clientId ? { author: { clientId: t.clientId, name: authors.names.get(t.clientId) ?? 'Former member', isYou: t.clientId === authors.me } } : {}),
        id: t.id,
        possibleDuplicate: dupes.has(t.id),
        type: t.type,
        category: t.category,
        title: t.title,
        subCategory: t.subCategory ?? null,
        description: t.description,
        note: t.note ?? null,
        tags: unpackTags(t.tags),
        // Income is positive, spending negative; a transfer is neither, so it keeps its plain size.
        amount: t.type === 'INCOME' ? raw : t.type === 'TRANSFER' ? raw : -raw,
        date: t.date,
        walletId: t.walletId,
        wallet: w ? { name: w.name, color: w.color, currency: w.currency, archived: w.archived } : null,
        currency: w?.currency ?? null,
        receiptUrl: t.receiptUrl,
        receiptReportUrl: t.receiptReportUrl ?? null,
        debtId: t.debtId ?? null,
        debtRole: t.debtRole ?? null,
        debt: debt ? { person: debt.person, kind: debt.kind, status: debt.status, amount: num(debt.amount), paid: num(debt.paid), currency: debt.currency, payments: debt._count.payments, installments: debt._count.installments } : null,
        fundedBy: funded ? { debtId: t.fundedByDebtId, person: funded.person } : null,
        schedule: occ ? { id: occ.scheduleId, title: occ.schedule.title, repeat: occ.schedule.repeat ?? null, mode: occ.schedule.mode, status: occ.schedule.status } : null,
        transfer: t.type === 'TRANSFER'
          ? { toWalletId: t.toWalletId, toWallet: to ? { name: to.name, color: to.color, currency: to.currency, archived: to.archived } : null, toAmount: t.toAmount == null ? null : num(t.toAmount), exchangeRate: t.exchangeRate == null ? null : num(t.exchangeRate) }
          : null,
      };
    });
    const walletId = f.walletIds[0];
    const balances = walletId && this.plainWalletTimeline(f) ? await this.balancesAfter(scope, walletId, rows) : null;
    const withBalance = balances ? items.map(i => ({ ...i, balanceAfter: balances.get(i.id) ?? null })) : items;
    const last = rows[rows.length - 1];
    return { items: withBalance, nextCursor: hasMore && last ? (byDate ? encodeCursor(last) : encodeOffset(offset + rows.length)) : null };
  }

  /** True when the filter hides nothing inside the wallet's own timeline, so a running balance is honest. */
  private plainWalletTimeline(f: FeedFilter): boolean {
    return f.walletIds.length === 1 && !f.kinds.length && f.includeLoans && !f.memberId && !f.search && !f.include.length && !f.exclude.length
      && f.minAmount === null && f.maxAmount === null && f.receipt === 'any' && f.source === 'any' && !f.schedules.length && f.schedMode === 'any' && !f.flags.length && !f.tags.length && f.groupBy === 'none' && f.sort === 'newest';
  }

  /** What a set of rows does to one wallet: money in (income, transfers in) and out (spending, transfers out), as numbers in the wallet's currency. */
  private async effects(scope: Scope, walletId: string, when: Prisma.TransactionWhereInput): Promise<{ income: number; expense: number; transferIn: number; transferOut: number; count: number }> {
    const own = await this.prisma.transaction.groupBy({ by: ['type'], where: { ...scopeWhere(scope), walletId, ...when }, _sum: { amount: true }, _count: true });
    const withTo = await this.prisma.transaction.aggregate({ where: { ...scopeWhere(scope), toWalletId: walletId, type: 'TRANSFER', toAmount: { not: null }, ...when }, _sum: { toAmount: true }, _count: true });
    const sameTo = await this.prisma.transaction.aggregate({ where: { ...scopeWhere(scope), toWalletId: walletId, type: 'TRANSFER', toAmount: null, ...when }, _sum: { amount: true }, _count: true });
    const by = (t: string) => num(own.find(r => r.type === t)?._sum.amount);
    return {
      income: by('INCOME'), expense: by('EXPENSE'), transferOut: by('TRANSFER'),
      transferIn: num(withTo._sum.toAmount) + num(sameTo._sum.amount),
      count: own.reduce((n, r) => n + r._count, 0) + withTo._count + sameTo._count,
    };
  }
  private net = (e: { income: number; expense: number; transferIn: number; transferOut: number }) => e.income + e.transferIn - e.expense - e.transferOut;

  /**
   * One wallet over a period: what it started with, what came in and went out, what it ended with. Opening and closing are worked
   * back from today's balance (the balance is the truth); the "balanced" flag checks the period's own movements against them.
   */
  async statement(scope: Scope, walletId: string, f: FeedFilter) {
    const wallet = await this.prisma.wallet.findFirst({ where: { id: walletId, ...scopeWhere(scope) }, select: { id: true, name: true, color: true, currency: true, balance: true, archived: true, reconciledAt: true, reconciledBalance: true } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    const period = f.period;
    const balance = num(wallet.balance);
    const from = period?.from ?? null, to = period?.to ?? null;
    const sinceFrom = from ? await this.effects(scope, walletId, { date: { gte: from } }) : null;
    const afterTo = to ? await this.effects(scope, walletId, { date: { gte: to } }) : null;
    const inside = await this.effects(scope, walletId, { date: dateFilter(period ?? { from: null, to: null } as Period) });
    const closing = round2(balance - (afterTo ? this.net(afterTo) : 0));
    const opening = from ? round2(balance - (sinceFrom ? this.net(sinceFrom) : 0)) : round2(balance - this.net(await this.effects(scope, walletId, {})));
    const moneyIn = round2(inside.income + inside.transferIn), moneyOut = round2(inside.expense + inside.transferOut);
    return {
      wallet: { id: wallet.id, name: wallet.name, color: wallet.color, currency: wallet.currency, archived: wallet.archived, balance, reconciledAt: wallet.reconciledAt, reconciledBalance: wallet.reconciledBalance === null ? null : num(wallet.reconciledBalance) },
      period: { from, to },
      opening, in: moneyIn, out: moneyOut, closing,
      parts: { income: round2(inside.income), transfersIn: round2(inside.transferIn), spending: round2(inside.expense), transfersOut: round2(inside.transferOut) },
      count: inside.count,
      balanced: Math.abs(opening + moneyIn - moneyOut - closing) < 0.005,
    };
  }

  /** The wallet's balance right after each row (newest first), for a page of its own timeline. */
  private async balancesAfter(scope: Scope, walletId: string, rows: Array<{ id: string; date: Date; type: string; amount: Prisma.Decimal; toAmount: Prisma.Decimal | null; walletId: string | null; toWalletId: string | null }>) {
    if (!rows.length) return new Map<string, number>();
    const wallet = await this.prisma.wallet.findFirst({ where: { id: walletId, ...scopeWhere(scope) }, select: { balance: true } });
    if (!wallet) return new Map<string, number>();
    const first = rows[0];
    const newer = await this.effects(scope, walletId, { OR: [{ date: { gt: first.date } }, { date: first.date, id: { gt: first.id } }] });
    let running = num(wallet.balance) - this.net(newer);
    const out = new Map<string, number>();
    for (const r of rows) {
      out.set(r.id, round2(running));
      const raw = num(r.amount);
      const effect = r.type === 'TRANSFER' ? (r.walletId === walletId ? -raw : r.toWalletId === walletId ? (r.toAmount == null ? raw : num(r.toAmount)) : 0) : r.type === 'INCOME' ? raw : -raw;
      running -= effect;
    }
    return out;
  }

  /** Totals for everything the filter matches (not only the loaded page), per currency, with the change since the period before. */
  async summary(scope: Scope, f: FeedFilter, now = new Date()) {
    const pre = await this.prepare(scope, f);
    const rows = await this.prisma.transaction.findMany({ where: { ...scopeWhere(scope), ...this.conditions(scope, f, pre) }, select: { type: true, amount: true, date: true, walletId: true, debtRole: true } });
    const wallets = await this.walletCurrencies(scope, rows.map(r => r.walletId));
    const toSum = (r: (typeof rows)[number]): SumRow => ({ type: r.type, amount: num(r.amount), date: r.date, currency: (r.walletId && wallets.get(r.walletId)) || f.fallbackCurrency, debtRole: r.debtRole });

    const oldest = rows.reduce<Date | null>((min, r) => (!min || r.date < min ? r.date : min), null);
    const byCurrency = totalsByCurrency(rows.map(toSum), seriesSpan(f.period, oldest, now));

    const before = previousPeriod(f.period);
    const prevByCurrency = new Map<string, { income: number; expense: number }>();
    if (before) {
      const prevRows = await this.prisma.transaction.findMany({ where: { ...scopeWhere(scope), ...this.conditions(scope, f, pre, before) }, select: { type: true, amount: true, date: true, walletId: true, debtRole: true } });
      const prevWallets = await this.walletCurrencies(scope, prevRows.map(r => r.walletId));
      for (const t of totalsByCurrency(prevRows.map(r => ({ type: r.type, amount: num(r.amount), date: r.date, currency: (r.walletId && prevWallets.get(r.walletId)) || f.fallbackCurrency, debtRole: r.debtRole })), null)) {
        prevByCurrency.set(t.currency, { income: t.income, expense: t.expense });
      }
    }

    const currencies = byCurrency.map(t => {
      const prev = prevByCurrency.get(t.currency) ?? (before ? { income: 0, expense: 0 } : null);
      return { ...t, previous: prev, spendingChangePct: prev ? changePercent(t.expense, prev.expense) : null };
    });

    // One converted figure, only when asked, and only when every currency has a known rate (never a silent guess).
    let converted: { currency: string; income: number; expense: number; net: number; missing: string[] } | null = null;
    if (f.convertTo && currencies.length) {
      const rates = await this.fx.ratesFor(f.convertTo, currencies.map(c => c.currency));
      const missing = currencies.filter(c => rates[c.currency] === undefined).map(c => c.currency);
      const income = round2(currencies.reduce((s, c) => s + c.income * (rates[c.currency] ?? 0), 0));
      const expense = round2(currencies.reduce((s, c) => s + c.expense * (rates[c.currency] ?? 0), 0));
      converted = { currency: f.convertTo, income, expense, net: round2(income - expense), missing };
    }

    return {
      period: f.period ? { kind: f.period.kind, from: f.period.from, to: f.period.to } : { kind: 'all', from: null, to: null },
      count: rows.length,
      currencies,
      converted,
    };
  }

  /**
   * The categories and sub-categories this person has used, with counts that follow every OTHER filter (a choice here never
   * hides the others), merged the way they see them: retired categories folded in, one spelling per sub-category.
   */
  async facets(scope: Scope, f: FeedFilter) {
    const rows = await this.prisma.transaction.groupBy({
      by: ['type', 'category', 'subCategory'],
      where: { ...scopeWhere(scope), ...this.conditions(scope, { ...f, include: [], exclude: [] }, await this.prepare(scope, f)) },
      _count: { _all: true },
      _max: { date: true },
    });
    const categories = buildFacets(rows.map(r => ({ type: r.type, category: r.category, subCategory: r.subCategory, count: r._count._all, lastUsed: r._max.date })));
    return { total: rows.reduce((n, r) => n + r._count._all, 0), categories };
  }

  /** One header per category, wallet, member or title for the whole filter: how many rows and what came in and went out, per currency. */
  async groups(scope: Scope, f: FeedFilter) {
    if (f.groupBy === 'none') return { groupBy: f.groupBy, groups: [] as GroupTotals[] };
    const field = f.groupBy === 'category' ? 'category' : f.groupBy === 'wallet' ? 'walletId' : f.groupBy === 'member' ? 'clientId' : 'title';
    const by = [...new Set([field, 'walletId', 'type', 'debtRole'])] as any;
    const rows = await this.prisma.transaction.groupBy({
      by,
      where: { ...scopeWhere(scope), ...this.conditions(scope, f, await this.prepare(scope, f)) },
      _count: { _all: true },
      _sum: { amount: true },
    });
    const wallets = await this.walletCurrencies(scope, rows.map((r: any) => r.walletId));
    const data = rows.map((r: any) => ({
      key: String(r[field] ?? ''), walletCurrency: (r.walletId && wallets.get(r.walletId)) || f.fallbackCurrency, type: r.type, debtRole: r.debtRole ?? null,
      count: r._count._all, amount: num(r._sum.amount),
    }));
    return { groupBy: f.groupBy, groups: groupTotals(data, f.groupBy) };
  }

  /** What a typed word could mean: titles used before (with how often) and, for a person, the people they have loans with. */
  async suggest(scope: Scope, q: string) {
    const text = q.trim().slice(0, 60);
    if (text.length < 2) return { titles: [], people: [] };
    const [titles, people] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['title'], where: { ...scopeWhere(scope), type: { not: 'DEBT' }, title: { contains: text } }, _count: { _all: true }, orderBy: { _count: { title: 'desc' } }, take: 4,
      }),
      isFamily(scope) ? Promise.resolve([] as Array<{ person: string }>) : this.prisma.debt.findMany({ where: { clientId: scope.clientId, archivedAt: null, person: { contains: text } }, select: { person: true }, distinct: ['person'], take: 3 }),
    ]);
    return { titles: titles.filter(t => t.title.trim()).map(t => ({ title: t.title, count: t._count._all })), people: people.map(p => p.person) };
  }

  private async walletCurrencies(scope: Scope, ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map();
    const wallets = await this.prisma.wallet.findMany({ where: { id: { in: unique }, ...scopeWhere(scope) }, select: { id: true, currency: true } });
    return new Map(wallets.map(w => [w.id, w.currency] as const));
  }

  /** Names of the people who wrote these rows, for a family only. */
  private async authors(scope: Scope, rows: Array<{ clientId: string }>) {
    if (!isFamily(scope)) return undefined;
    if (!rows.length) return { names: new Map<string, string>(), me: scope.clientId };
    const ids = [...new Set(rows.map(r => r.clientId))];
    const people = await this.prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } });
    return { names: new Map(people.map(c => [c.id, [c.firstName, c.lastName].filter(Boolean).join(' ')] as const)), me: scope.clientId };
  }
}
