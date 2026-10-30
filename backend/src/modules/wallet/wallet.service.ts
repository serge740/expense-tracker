import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, Transaction } from '../../../generated/prisma';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { TransferDto } from './dto/transfer.dto';
import { ReconcileDto } from './dto/reconcile.dto';
import { ExchangeRateService } from './exchange-rate.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Scope, assertScopeCan, isFamily, scopeCan, scopeData, scopeWhere } from '../family/scope/scope';
import { errors } from '../family/family-errors';
import { retryOnConflict } from '../transaction/transaction.service';
import { diffFields, recordActivity } from '../activity/activity';

const DAY = 24 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Local calendar date as YYYY-MM-DD (toISOString would shift to UTC). */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Signed effect of a transaction on one wallet's balance. */
function effectOn(walletId: string, t: Pick<Transaction, 'type' | 'walletId' | 'toWalletId' | 'amount' | 'toAmount'>): number {
  const amt = Number(t.amount);
  if (t.type === 'TRANSFER' || t.type === 'DEBT') {
    let e = 0;
    if (t.walletId === walletId) e -= amt;
    if (t.toWalletId === walletId) e += Number(t.toAmount ?? t.amount);
    return e;
  }
  if (t.walletId !== walletId) return 0;
  return t.type === 'INCOME' ? amt : -amt;
}

/** Only these can be changed by an update. The request body is never spread into the database call: it could name clientId or familyId. */
const UPDATABLE = ['name', 'bank', 'last4', 'accountHolder', 'accountNumber', 'color', 'walletType', 'balance', 'isDefault', 'archived', 'currency'] as const;

/** Account details of a family wallet are for the people who manage it; everyone else sees name, bank, colour and balance. */
const PRIVATE_FIELDS = ['accountNumber', 'accountHolder', 'last4'] as const;

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: ExchangeRateService,
    private readonly notifications: NotificationsService,
  ) {}

  private serialize<T extends { balance: Prisma.Decimal }>(w: T, scope: Scope) {
    const out: Record<string, unknown> = { ...w, balance: Number(w.balance) };
    if (isFamily(scope) && !scopeCan(scope, 'wallet.manage')) for (const k of PRIVATE_FIELDS) if (k in out) out[k] = null;
    return out as T & { balance: number };
  }

  async findAll(scope: Scope) {
    const wallets = await this.prisma.wallet.findMany({
      where: scopeWhere(scope),
      orderBy: [{ archived: 'asc' }, { isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return wallets.map(w => this.serialize(w, scope));
  }

  /** Kept for existing screens: totals in each wallet's own number, no conversion. */
  async summary(scope: Scope) {
    const wallets = await this.prisma.wallet.findMany({ where: { ...scopeWhere(scope), archived: false } });
    const totalBalance = wallets.reduce((s, w) => s + Number(w.balance), 0);
    return { totalBalance, walletCount: wallets.length };
  }

  /**
   * Net worth in `base` currency now and at the end of yesterday, plus the
   * per-currency breakdown. Wallets whose currency has no known rate are
   * listed in `unconverted` instead of being silently added 1:1.
   */
  async overview(scope: Scope, base: string) {
    const wallets = await this.prisma.wallet.findMany({ where: { ...scopeWhere(scope), archived: false } });
    const rates = await this.fx.ratesFor(base, wallets.map(w => w.currency));

    const todayStart = startOfDay(new Date());
    const ids = wallets.map(w => w.id);
    const sinceToday = ids.length
      ? await this.prisma.transaction.findMany({
          where: { ...scopeWhere(scope), date: { gte: todayStart }, OR: [{ walletId: { in: ids } }, { toWalletId: { in: ids } }] },
        })
      : [];

    let total = 0;
    let yesterday = 0;
    const byCurrency: Record<string, number> = {};
    const unconverted: string[] = [];
    for (const w of wallets) {
      const bal = Number(w.balance);
      const closeYesterday = bal - sinceToday.reduce((s, t) => s + effectOn(w.id, t), 0);
      byCurrency[w.currency] = round2((byCurrency[w.currency] ?? 0) + bal);
      const r = rates[w.currency];
      if (r === undefined) { unconverted.push(w.currency); continue; }
      total += bal * r;
      yesterday += closeYesterday * r;
    }

    return {
      base,
      total: round2(total),
      yesterday: round2(yesterday),
      change: round2(total - yesterday),
      walletCount: wallets.length,
      byCurrency,
      unconverted: [...new Set(unconverted)],
      rates,
      ratesUpdatedAt: this.fx.updatedAt,
    };
  }

  /** In / out per day for the last `days` days (transfers excluded), in `base`. */
  async dailyFlow(scope: Scope, base: string, days: number, walletId?: string) {
    const n = Math.min(Math.max(days || 7, 1), 92);
    const from = startOfDay(new Date(Date.now() - (n - 1) * DAY));
    const wallets = await this.prisma.wallet.findMany({ where: scopeWhere(scope), select: { id: true, currency: true } });
    const currencyOf = new Map(wallets.map(w => [w.id, w.currency]));
    const rates = await this.fx.ratesFor(base, wallets.map(w => w.currency));

    const txns = await this.prisma.transaction.findMany({
      where: { ...scopeWhere(scope), type: { in: ['INCOME', 'EXPENSE'] }, date: { gte: from }, ...(walletId ? { walletId } : {}) },
      select: { type: true, amount: true, date: true, walletId: true },
    });

    const buckets = Array.from({ length: n }, (_, i) => {
      const d = new Date(from.getTime() + i * DAY);
      return { date: ymd(d), in: 0, out: 0 };
    });
    for (const t of txns) {
      const i = Math.floor((startOfDay(t.date).getTime() - from.getTime()) / DAY);
      if (i < 0 || i >= n) continue;
      // No wallet → assume the base currency; unknown rate → skip rather than guess.
      const r = t.walletId ? rates[currencyOf.get(t.walletId) ?? base] : 1;
      if (r === undefined) continue;
      const v = Number(t.amount) * r;
      if (t.type === 'INCOME') buckets[i].in += v; else buckets[i].out += v;
    }
    const days_ = buckets.map(b => ({ ...b, in: round2(b.in), out: round2(b.out) }));
    return {
      base,
      days: days_,
      totalIn: round2(days_.reduce((s, b) => s + b.in, 0)),
      totalOut: round2(days_.reduce((s, b) => s + b.out, 0)),
    };
  }

  /** Closing balance for each of the last `days` days, rebuilt from transactions. */
  async balanceHistory(scope: Scope, id: string, days: number) {
    const wallet = await this.assertInScope(scope, id);
    const n = Math.min(Math.max(days || 30, 1), 366);
    const from = startOfDay(new Date(Date.now() - (n - 1) * DAY));
    const txns = await this.prisma.transaction.findMany({
      where: { ...scopeWhere(scope), date: { gte: from }, OR: [{ walletId: id }, { toWalletId: id }] },
      orderBy: { date: 'desc' },
    });

    // Walk back from today's balance; closing(day) = closing(day+1) − effect(day+1).
    let running = Number(wallet.balance);
    const points: { date: string; balance: number }[] = [];
    let ti = 0;
    for (let i = n - 1; i >= 0; i--) {
      const dayStart = new Date(from.getTime() + i * DAY);
      points.push({ date: ymd(dayStart), balance: round2(running) });
      while (ti < txns.length && txns[ti].date >= dayStart) {
        running -= effectOn(id, txns[ti]);
        ti++;
      }
    }
    return { walletId: id, currency: wallet.currency, points: points.reverse() };
  }

  /** Transactions incl. transfers, newest first, with the wallet names involved. */
  async activity(scope: Scope, limit: number, walletId?: string) {
    const take = Math.min(Math.max(limit || 20, 1), 100);
    const txns = await this.prisma.transaction.findMany({
      where: { ...scopeWhere(scope), ...(walletId ? { OR: [{ walletId }, { toWalletId: walletId }] } : {}) },
      orderBy: { date: 'desc' },
      take,
    });
    const wallets = await this.prisma.wallet.findMany({ where: scopeWhere(scope), select: { id: true, name: true, currency: true } });
    const byId = new Map(wallets.map(w => [w.id, w]));
    return txns.map(t => ({
      id: t.id,
      type: t.type,
      category: t.category,
      title: t.title,
      note: t.description,
      amount: Number(t.amount),
      toAmount: t.toAmount === null ? null : Number(t.toAmount),
      exchangeRate: t.exchangeRate === null ? null : Number(t.exchangeRate),
      date: t.date,
      wallet: t.walletId ? byId.get(t.walletId) ?? null : null,
      toWallet: t.toWalletId ? byId.get(t.toWalletId) ?? null : null,
    }));
  }

  async findOne(scope: Scope, id: string) {
    return this.serialize(await this.assertInScope(scope, id), scope);
  }

  async rates(base: string, codes: string[]) {
    const rates = await this.fx.ratesFor(base, codes.filter(c => c !== base).slice(0, 20));
    return { base, rates, updatedAt: this.fx.updatedAt };
  }

  /** Quote for a cross-currency transfer (no side effects). */
  async quote(scope: Scope, fromWalletId: string, toWalletId: string, amount: number) {
    const [from, to] = await Promise.all([this.assertInScope(scope, fromWalletId, true), this.assertInScope(scope, toWalletId, true)]);
    const rate = await this.fx.rate(from.currency, to.currency);
    return {
      from: from.currency,
      to: to.currency,
      rate,
      toAmount: rate === null ? null : round2(amount * rate),
      ratesUpdatedAt: this.fx.updatedAt,
    };
  }

  /** Atomic move between two wallets (with conversion when currencies differ). Both must be in the same scope. */
  async transfer(scope: Scope, dto: TransferDto) {
    assertScopeCan(scope, 'tx.add');
    const amount = Number(dto.amount);
    if (!dto.fromWalletId || !dto.toWalletId) throw new BadRequestException('Choose both wallets');
    if (dto.fromWalletId === dto.toWalletId) throw new BadRequestException('Choose two different wallets');
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Enter an amount greater than zero');

    const [from, to] = await Promise.all([this.assertInScope(scope, dto.fromWalletId, true), this.assertInScope(scope, dto.toWalletId, true)]);
    if (from.archived || to.archived) throw new BadRequestException('Archived wallets cannot send or receive money');
    if (from.walletType !== 'CREDIT' && Number(from.balance) < amount) {
      throw new BadRequestException(`Not enough money in ${from.name}`);
    }

    let rate = 1;
    if (from.currency !== to.currency) {
      const manual = dto.rate !== undefined ? Number(dto.rate) : undefined;
      if (manual !== undefined && (!Number.isFinite(manual) || manual <= 0)) throw new BadRequestException('Invalid exchange rate');
      const live = manual ?? (await this.fx.rate(from.currency, to.currency));
      if (!live) throw new BadRequestException(`No exchange rate for ${from.currency} → ${to.currency}. Enter one manually.`);
      rate = live;
    }
    const toAmount = round2(amount * rate);

    const tx = await retryOnConflict(() => this.prisma.$transaction(async prx => {
      // Both wallets are changed first, always in the same (id) order, so two transfers can never wait on each other in a circle.
      const ordered = [{ id: from.id, change: { decrement: new Prisma.Decimal(amount) } }, { id: to.id, change: { increment: new Prisma.Decimal(toAmount) } }]
        .sort((a, b) => a.id.localeCompare(b.id));
      for (const w of ordered) await prx.wallet.update({ where: { id: w.id }, data: { balance: w.change } });
      const created = await prx.transaction.create({
        data: {
          ...scopeData(scope),
          type: 'TRANSFER',
          category: 'other',
          title: from.currency === to.currency ? `Transfer to ${to.name}` : `Exchange to ${to.name}`,
          description: dto.note || null,
          amount,
          toAmount,
          exchangeRate: from.currency === to.currency ? null : rate,
          date: dto.date ? new Date(dto.date) : new Date(),
          walletId: from.id,
          toWalletId: to.id,
        },
      });
      await recordActivity(prx, scope, { kind: 'wallet.transfer', entity: 'wallet', entityId: from.id, title: `${from.name} → ${to.name}`, amount, currency: from.currency, changes: from.currency === to.currency ? undefined : [{ field: 'received', from: null, to: `${toAmount} ${to.currency}` }] });
      return created;
    }));

    const fmt = (v: number, c: string) => `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${c}`;
    this.notifications.notify(
      scope.clientId,
      from.currency === to.currency ? 'Transfer completed' : 'Exchange completed',
      `${fmt(amount, from.currency)} from ${from.name} → ${fmt(toAmount, to.currency)} to ${to.name}`,
      'transaction',
    );
    return { id: tx.id, amount, toAmount, rate, from: from.currency, to: to.currency };
  }

  /**
   * Compares the balance this app holds with what the real account shows. A match is remembered; a difference is reported,
   * and only put right (with a visible "Balance adjustment" transaction) when the person asks for it.
   */
  async reconcile(scope: Scope, id: string, dto: ReconcileDto) {
    assertScopeCan(scope, 'wallet.manage');
    const actual = round2(Number(dto?.actualBalance));
    if (!Number.isFinite(actual)) throw new BadRequestException('Enter the balance your account shows');
    const w = await this.assertInScope(scope, id);
    const expected = round2(Number(w.balance));
    const difference = round2(actual - expected);
    const base = { walletId: id, currency: w.currency, expected, actual, difference };
    if (Math.abs(difference) < 0.005) {
      await this.prisma.wallet.update({ where: { id }, data: { reconciledAt: new Date(), reconciledBalance: actual } });
      await recordActivity(this.prisma, scope, { kind: 'wallet.reconciled', entity: 'wallet', entityId: id, title: w.name, amount: actual, currency: w.currency });
      return { ...base, matches: true, adjusted: false };
    }
    if (!dto.adjust) return { ...base, matches: false, adjusted: false };
    if (w.archived) throw new BadRequestException('An archived wallet cannot be changed');
    assertScopeCan(scope, 'tx.add');
    const income = difference > 0;
    const row = await retryOnConflict(() => this.prisma.$transaction(async prx => {
      await prx.wallet.update({ where: { id }, data: { balance: { increment: new Prisma.Decimal(difference) }, reconciledAt: new Date(), reconciledBalance: actual } });
      const t = await prx.transaction.create({
        data: { ...scopeData(scope), type: income ? 'INCOME' : 'EXPENSE', category: 'other', title: 'Balance adjustment', description: 'Added to match the real account', amount: Math.abs(difference), date: new Date(), walletId: id },
      });
      await recordActivity(prx, scope, { kind: 'wallet.reconciled', entity: 'wallet', entityId: id, title: w.name, amount: actual, currency: w.currency, changes: [{ field: 'balance', from: expected, to: actual }] });
      return t;
    }));
    return { ...base, matches: false, adjusted: true, transactionId: row.id };
  }

  async create(scope: Scope, dto: CreateWalletDto) {
    assertScopeCan(scope, 'wallet.manage');
    const count = await this.prisma.wallet.count({ where: scopeWhere(scope) });
    const wallet = await this.prisma.wallet.create({
      data: {
        ...scopeData(scope),
        name: dto.name,
        bank: dto.bank,
        accountHolder: dto.accountHolder?.trim() || null,
        accountNumber: dto.accountNumber?.replace(/\s+/g, '') || null,
        // Last 4 digits shown on cards come from the account / phone number.
        last4: dto.last4 ?? (dto.accountNumber ? dto.accountNumber.replace(/\D/g, '').slice(-4) || null : null),
        color: dto.color ?? '#0F2F3A', // dark green card (app default theme)
        walletType: dto.walletType ?? 'CHECKING',
        balance: dto.balance ?? 0,
        currency: (dto.currency ?? 'RWF').toUpperCase(),
        isDefault: count === 0,      // the first wallet of this scope (personal, or this family) is its default
      },
    });
    await recordActivity(this.prisma, scope, { kind: 'wallet.created', entity: 'wallet', entityId: wallet.id, title: wallet.name, amount: Number(wallet.balance), currency: wallet.currency });
    return this.serialize(wallet, scope);
  }

  async update(scope: Scope, id: string, dto: UpdateWalletDto) {
    assertScopeCan(scope, 'wallet.manage');
    const before = await this.assertInScope(scope, id);
    // Changing currency relabels the balance (no conversion) — used to correct
    // wallets created before currencies existed. The app warns before saving.
    const body = (dto ?? {}) as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const k of UPDATABLE) if (body[k] !== undefined) picked[k] = body[k];
    const data = {
      ...picked,
      ...(dto.currency ? { currency: dto.currency.toUpperCase() } : {}),
      ...(dto.accountNumber !== undefined ? {
        accountNumber: dto.accountNumber.replace(/\s+/g, '') || null,
        last4: dto.accountNumber.replace(/\D/g, '').slice(-4) || null,
      } : {}),
      ...(dto.accountHolder !== undefined ? { accountHolder: dto.accountHolder.trim() || null } : {}),
    };
    const wallet = await this.prisma.wallet.update({ where: { id }, data });
    await recordActivity(this.prisma, scope, { kind: 'wallet.edited', entity: 'wallet', entityId: id, title: wallet.name, currency: wallet.currency, changes: diffFields(before, wallet, ['name', 'bank', 'currency', 'walletType', 'color', 'archived', 'isDefault']) });
    return this.serialize(wallet, scope);
  }

  async remove(scope: Scope, id: string) {
    const gone = await this.assertInScope(scope, id);
    if (isFamily(scope)) {
      // A family's history must not change under everyone's feet: only the owner deletes, and only an unused wallet.
      assertScopeCan(scope, 'wallet.delete');
      const used = await this.prisma.transaction.count({ where: { familyId: scope.familyId, OR: [{ walletId: id }, { toWalletId: id }] } });
      if (used > 0) throw errors.walletHasHistory();
    }
    await this.prisma.wallet.delete({ where: { id } });
    await recordActivity(this.prisma, scope, { kind: 'wallet.deleted', entity: 'wallet', entityId: id, title: gone.name, currency: gone.currency });
    return { success: true };
  }

  /**
   * The wallet, if it is in this scope. Never looked up by id alone, so another person's or another family's wallet is
   * simply "not found". With `explainMix`, asking for one of your own personal wallets from inside a family says so,
   * because mixing the two is a mistake the app can explain.
   */
  async assertInScope(scope: Scope, id: string, explainMix = false) {
    const w = await this.prisma.wallet.findFirst({ where: { id, ...scopeWhere(scope) } });
    if (w) return w;
    if (explainMix && isFamily(scope)) {
      const mine = await this.prisma.wallet.findFirst({ where: { id, clientId: scope.clientId, familyId: null }, select: { id: true } });
      if (mine) throw errors.wrongScope();
    }
    throw errors.walletNotFound();
  }
}
