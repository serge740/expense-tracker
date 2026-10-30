import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CategorySlug, Prisma, ScheduledTransaction } from '../../../generated/prisma';
import { TransactionService } from '../transaction/transaction.service';
import { CreateTransactionDto } from '../transaction/dto/create-transaction.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { RemindersService } from '../reminders/reminders.service';
import { isValidTimeZone, localParts, zonedToUtc } from '../reminders/reminder-policy';
import { normalizeRule, occurrences, RepeatRule, ruleProblem, Wall } from './recurrence';
import { CreateScheduledDto, ConfirmOccurrenceDto, UpdateScheduledDto } from './dto/scheduled.dto';
import { canonicalCategory, normalizeSubCategory } from '../../common/utils/categories';
import { rememberSubCategory } from '../../common/utils/subcategory';
import { Scope, assertScopeCan, isFamily, personalScope, scopeData, scopeWhere } from '../family/scope/scope';
import { ScopeService } from '../family/scope/scope.service';
import { can } from '../family/family-permissions';
import { diffFields, recordActivity, type ActivityKind } from '../activity/activity';

const MIN = 60_000;
/** After a long outage, at most this many missed dates are caught up; the rest are dropped and the schedule resumes from now. */
export const CATCH_UP_CAP = 31;
/** A first date may be a few minutes in the past (the person took a moment to press Save). */
const START_GRACE_MS = 5 * MIN;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** A rule stored in the JSON column (null = happens once). */
const asJson = (rule: RepeatRule | null) => (rule ? (rule as unknown as Prisma.InputJsonValue) : Prisma.JsonNull);

/** An expected problem the person can fix (wallet gone, already handled…). */
class Failure extends Error {}

/** Callers may still pass a plain client id: that is the person's own (personal) space. */
const scopeOf = (who: string | Scope): Scope => (typeof who === 'string' ? personalScope(who) : who);

const plusMinute = (w: Wall): Wall => {
  const t = new Date(Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi + 1));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
};

@Injectable()
export class ScheduledService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly notifications: NotificationsService,
    private readonly reminders: RemindersService,
    private readonly scopes: ScopeService,
  ) {}

  /** Due items are posted and next dates are lined up at the start of every reminder tick. */
  onModuleInit() {
    this.reminders.onTick(now => this.processDue(now));
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  private validDate(value: unknown, what: string): Date {
    const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) throw new BadRequestException(`Choose a valid ${what}`);
    return d;
  }

  private futureStart(value: unknown, now = new Date()): Date {
    const d = this.validDate(value, 'first date');
    if (d.getTime() < now.getTime() - START_GRACE_MS) throw new BadRequestException('Choose a first date in the future');
    return d;
  }

  private async checkWallet(scope: Scope, walletId: string | null | undefined) {
    if (!walletId) return;
    const w = await this.prisma.wallet.findFirst({ where: { id: walletId, ...scopeWhere(scope) } });
    if (!w) throw new NotFoundException('Wallet not found');
    if (w.archived) throw new BadRequestException('That wallet is archived');
  }

  private parseRule(value: unknown): RepeatRule | null {
    if (value === null || value === undefined) return null;
    const problem = ruleProblem(value);
    if (problem) throw new BadRequestException(problem);
    return normalizeRule(value as RepeatRule);
  }

  private amountOf(value: unknown): number {
    const n = round2(Number(value));
    if (!Number.isFinite(n) || n <= 0) throw new BadRequestException('Enter an amount greater than zero');
    if (n > 9_999_999_999) throw new BadRequestException('That amount is too large');
    return n;
  }

  private categoryOf(value: unknown): CategorySlug {
    if (typeof value !== 'string' || !(Object.values(CategorySlug) as string[]).includes(value)) throw new BadRequestException('Choose a category');
    return value as CategorySlug;
  }

  private async zoneFor(scope: Scope, requested?: string): Promise<string> {
    if (requested) {
      if (!isValidTimeZone(requested)) throw new BadRequestException('Unknown time zone');
      return requested;
    }
    if (isFamily(scope)) return scope.timezone || 'UTC';
    const pref = await this.prisma.notificationPreference.findUnique({ where: { clientId: scope.clientId } });
    return pref?.timezone ?? 'UTC';
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  private serialize(s: ScheduledTransaction) {
    return { ...s, amount: Number(s.amount), repeat: (s.repeat as RepeatRule | null) ?? null };
  }

  /** One line in the Activity timeline for this schedule. */
  private log(scope: Scope, kind: ActivityKind, s: { id: string; title: string; amount: unknown }, changes?: Array<{ field: string; from: string | number | null; to: string | number | null }>) {
    return recordActivity(this.prisma as never, scope, { kind, entity: 'schedule', entityId: s.id, title: s.title, amount: Number(s.amount), changes });
  }

  private async owned(scope: Scope, id: string) {
    const s = await this.prisma.scheduledTransaction.findFirst({ where: { id, ...scopeWhere(scope) } });
    if (!s) throw new NotFoundException('Scheduled transaction not found');
    return s;
  }

  async list(who: string | Scope, status?: string) {
    const scope = scopeOf(who);
    const where: Prisma.ScheduledTransactionWhereInput = {
      ...scopeWhere(scope),
      status: status === 'ACTIVE' || status === 'PAUSED' || status === 'ENDED' ? status : { in: ['ACTIVE', 'PAUSED'] },
    };
    const rows = await this.prisma.scheduledTransaction.findMany({
      where,
      include: { occurrences: { where: { status: 'PENDING' }, orderBy: { dueAt: 'asc' }, take: 5 }, wallet: { select: { currency: true } } },
      orderBy: [{ status: 'asc' }, { nextDueAt: 'asc' }, { createdAt: 'desc' }],
    });
    const now = Date.now();
    return rows.map(({ occurrences: waiting, wallet, ...s }) => ({
      ...this.serialize(s as ScheduledTransaction),
      currency: wallet?.currency ?? '',
      waiting: waiting.map(o => ({ id: o.id, dueAt: o.dueAt, overdue: o.dueAt.getTime() < now })),
    }));
  }

  async findOne(who: string | Scope, id: string, now = new Date()) {
    const scope = scopeOf(who);
    const s = await this.owned(scope, id);
    const rule = (s.repeat as RepeatRule | null) ?? null;
    const startWall = localParts(s.startAt, s.timezone);
    const upcoming = s.status === 'ACTIVE'
      ? occurrences(rule, startWall, 5, localParts(now, s.timezone)).map(w => zonedToUtc(w, s.timezone))
      : [];
    const wallet = s.walletId ? await this.prisma.wallet.findUnique({ where: { id: s.walletId }, select: { currency: true } }) : null;
    const [waiting, history] = await Promise.all([
      this.prisma.scheduledOccurrence.findMany({ where: { scheduleId: id, status: 'PENDING' }, orderBy: { dueAt: 'asc' } }),
      this.prisma.scheduledOccurrence.findMany({ where: { scheduleId: id, status: { not: 'PENDING' } }, orderBy: { dueAt: 'desc' }, take: 10 }),
    ]);
    return {
      ...this.serialize(s),
      currency: wallet?.currency ?? '',
      upcoming,
      waiting: waiting.map(o => ({ id: o.id, dueAt: o.dueAt, overdue: o.dueAt.getTime() < now.getTime() })),
      history,
    };
  }

  /** Every occurrence waiting for an answer, across all schedules (the "due now" list). */
  async waiting(who: string | Scope, now = new Date()) {
    const scope = scopeOf(who);
    const rows = await this.prisma.scheduledOccurrence.findMany({
      where: { status: 'PENDING', dueAt: { lte: new Date(now.getTime() + 24 * 60 * MIN) }, schedule: { ...scopeWhere(scope), status: 'ACTIVE' } },
      include: { schedule: { include: { wallet: { select: { currency: true, name: true } } } } },
      orderBy: { dueAt: 'asc' },
      take: 100,
    });
    return rows.map(o => ({
      id: o.id, scheduleId: o.schedule.id, dueAt: o.dueAt, overdue: o.dueAt.getTime() < now.getTime(),
      type: o.schedule.type, title: o.schedule.title, amount: Number(o.schedule.amount), category: o.schedule.category,
      walletId: o.schedule.walletId, currency: o.schedule.wallet?.currency ?? '', mode: o.schedule.mode,
    }));
  }

  // ── Creating and editing ───────────────────────────────────────────────────

  async create(who: string | Scope, dto: CreateScheduledDto) {
    const scope = scopeOf(who);
    assertScopeCan(scope, 'schedule.manage');
    if (dto?.type !== 'INCOME' && dto?.type !== 'EXPENSE') throw new BadRequestException('Choose income or expense');
    if (!dto.title?.trim()) throw new BadRequestException('Enter a title');
    const amount = this.amountOf(dto.amount);
    // A retired category an older app still sends becomes the new one (groceries -> Food, "Groceries").
    const canon = canonicalCategory(String(dto.category));
    const category = this.categoryOf(canon.category);
    const subCategory = normalizeSubCategory(dto.subCategory) ?? canon.subCategory ?? null;
    const startAt = this.futureStart(dto.startAt);
    const repeat = this.parseRule(dto.repeat);
    const mode = dto.mode === 'AUTO_POST' ? 'AUTO_POST' : 'REMIND_CONFIRM';
    if (isFamily(scope) && !dto.walletId) throw new BadRequestException('Choose the family wallet it will use');
    await this.checkWallet(scope, dto.walletId);
    const timezone = await this.zoneFor(scope, dto.timezone);

    const s = await this.prisma.scheduledTransaction.create({
      data: {
        ...scopeData(scope), type: dto.type, category, title: dto.title.trim(), subCategory,
        description: dto.description?.trim() || null, amount, walletId: dto.walletId ?? null, startAt, timezone,
        repeat: asJson(repeat), mode,
      },
    });
    if (!isFamily(scope)) await rememberSubCategory(this.prisma, scope.clientId, dto.type, category, subCategory);
    await this.log(scope, 'schedule.created', s);
    await this.materialize(s.id);
    return this.findOne(scope, s.id);
  }

  async update(who: string | Scope, id: string, dto: UpdateScheduledDto) {
    const scope = scopeOf(who);
    assertScopeCan(scope, 'schedule.manage');
    const s = await this.owned(scope, id);
    if (s.status === 'ENDED') throw new BadRequestException('This scheduled transaction has ended');
    const now = new Date();

    const data: Prisma.ScheduledTransactionUpdateInput = {};
    if (dto.title !== undefined) {
      if (!dto.title.trim()) throw new BadRequestException('Enter a title');
      data.title = dto.title.trim();
    }
    if (dto.amount !== undefined) data.amount = this.amountOf(dto.amount);
    let finalCategory: CategorySlug = s.category;
    if (dto.category !== undefined) {
      const canon = canonicalCategory(String(dto.category));
      finalCategory = this.categoryOf(canon.category);
      data.category = finalCategory;
      if (dto.subCategory === undefined && canon.subCategory) data.subCategory = canon.subCategory;
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.subCategory !== undefined) data.subCategory = normalizeSubCategory(dto.subCategory);
    if (dto.walletId !== undefined) {
      if (isFamily(scope) && !dto.walletId) throw new BadRequestException('Choose the family wallet it will use');
      await this.checkWallet(scope, dto.walletId);
      data.wallet = dto.walletId ? { connect: { id: dto.walletId } } : { disconnect: true };
    }
    const modeChanged = dto.mode !== undefined && dto.mode !== s.mode;
    if (dto.mode !== undefined) data.mode = dto.mode === 'AUTO_POST' ? 'AUTO_POST' : 'REMIND_CONFIRM';

    const startChanged = dto.startAt !== undefined;
    const ruleChanged = dto.repeat !== undefined;
    const zoneChanged = dto.timezone !== undefined && dto.timezone !== s.timezone;
    if (startChanged) data.startAt = this.futureStart(dto.startAt, now);
    if (ruleChanged) data.repeat = asJson(this.parseRule(dto.repeat));
    if (zoneChanged) data.timezone = await this.zoneFor(scope, dto.timezone);
    const timingChanged = startChanged || ruleChanged || zoneChanged;

    await this.prisma.$transaction(async prx => {
      if (timingChanged) {
        // Waiting dates were worked out from the old timing: drop them (their reminders go too) and line up new ones.
        // Anything already posted or skipped stays as history, and is never rewritten.
        await prx.scheduledOccurrence.deleteMany({ where: { scheduleId: id, status: 'PENDING' } });
        data.lastDueAt = startChanged ? null : now;
        data.nextDueAt = null;
      }
      const after = await prx.scheduledTransaction.update({ where: { id }, data });
      await this.log(scope, 'schedule.edited', after, [...diffFields(s, after, ['title', 'amount', 'category', 'subCategory', 'description', 'walletId', 'mode', 'startAt', 'timezone']), ...(ruleChanged ? [{ field: 'repeat', from: null, to: 'changed' }] : [])]);
      if (typeof data.subCategory === 'string' && !isFamily(scope)) await rememberSubCategory(prx, scope.clientId, s.type, finalCategory, data.subCategory);
    });
    if (timingChanged) await this.materialize(id);
    else if (modeChanged) await this.reminders.syncScheduleSafe(id);
    return this.findOne(scope, id);
  }

  async pause(who: string | Scope, id: string) {
    const scope = scopeOf(who);
    assertScopeCan(scope, 'schedule.manage');
    const s = await this.owned(scope, id);
    if (s.status !== 'ACTIVE') throw new BadRequestException('Only an active schedule can be paused');
    await this.prisma.$transaction([
      this.prisma.scheduledOccurrence.deleteMany({ where: { scheduleId: id, status: 'PENDING' } }),
      this.prisma.scheduledTransaction.update({ where: { id }, data: { status: 'PAUSED', nextDueAt: null } }),
    ]);
    await this.log(scope, 'schedule.paused', s);
    return this.findOne(scope, id);
  }

  /** Resuming never backfills what was missed while paused. */
  async resume(who: string | Scope, id: string) {
    const scope = scopeOf(who);
    assertScopeCan(scope, 'schedule.manage');
    const s = await this.owned(scope, id);
    if (s.status !== 'PAUSED') throw new BadRequestException('Only a paused schedule can be resumed');
    await this.prisma.scheduledTransaction.update({ where: { id }, data: { status: 'ACTIVE', lastDueAt: new Date() } });
    await this.log(scope, 'schedule.resumed', s);
    await this.materialize(id);
    return this.findOne(scope, id);
  }

  async end(who: string | Scope, id: string) {
    const scope = scopeOf(who);
    assertScopeCan(scope, 'schedule.manage');
    const s = await this.owned(scope, id);
    await this.prisma.$transaction([
      this.prisma.scheduledOccurrence.deleteMany({ where: { scheduleId: id, status: 'PENDING' } }),
      this.prisma.scheduledTransaction.update({ where: { id }, data: { status: 'ENDED', nextDueAt: null } }),
    ]);
    await this.log(scope, 'schedule.ended', s);
    return this.findOne(scope, id);
  }

  // ── Lining up dates ────────────────────────────────────────────────────────

  /**
   * Keeps exactly one future occurrence waiting, plus any past ones not yet handled (catch-up, capped).
   * Safe to call at any time and from several places: dates are unique per schedule.
   */
  async materialize(scheduleId: string, now = new Date()) {
    const sch = await this.prisma.scheduledTransaction.findUnique({ where: { id: scheduleId } });
    if (!sch || sch.status !== 'ACTIVE') return;
    const rule = (sch.repeat as RepeatRule | null) ?? null;
    const tz = sch.timezone;
    const startWall = localParts(sch.startAt, tz);
    let lastDue = sch.lastDueAt;
    // Dates already waiting in the past count toward the catch-up cap.
    let made = await this.prisma.scheduledOccurrence.count({ where: { scheduleId, status: 'PENDING', dueAt: { lte: now } } });
    let finished = false;

    for (let guard = 0; guard < CATCH_UP_CAP * 2 + 4; guard++) {
      const future = await this.prisma.scheduledOccurrence.findFirst({ where: { scheduleId, status: 'PENDING', dueAt: { gt: now } } });
      if (future) break;

      const from = lastDue ? plusMinute(localParts(lastDue, tz)) : startWall;
      const next = occurrences(rule, startWall, 1, from)[0];
      if (!next) { finished = true; break; }
      const dueAt = zonedToUtc(next, tz);

      // Two wall-clock times can map to one instant around a clock change: just move past it.
      if (lastDue && dueAt.getTime() <= lastDue.getTime()) { lastDue = dueAt; continue; }

      // Far too many missed (a very long outage): drop the rest and carry on from now.
      if (dueAt.getTime() <= now.getTime() && made >= CATCH_UP_CAP) { lastDue = now; made = 0; continue; }

      try {
        await this.prisma.scheduledOccurrence.create({ data: { scheduleId, dueAt } });
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e;          // already there: fine
      }
      lastDue = dueAt;
      made++;
      if (dueAt.getTime() > now.getTime()) break;
    }

    const future = await this.prisma.scheduledOccurrence.findFirst({ where: { scheduleId, status: 'PENDING', dueAt: { gt: now } }, orderBy: { dueAt: 'asc' } });
    await this.prisma.scheduledTransaction.update({ where: { id: scheduleId }, data: { lastDueAt: lastDue, nextDueAt: future?.dueAt ?? null } });
    if (finished && !future) {
      const open = await this.prisma.scheduledOccurrence.count({ where: { scheduleId, status: 'PENDING' } });
      if (open === 0) await this.prisma.scheduledTransaction.update({ where: { id: scheduleId }, data: { status: 'ENDED' } });
    }
    await this.reminders.syncScheduleSafe(scheduleId);
  }

  /** Runs every minute: line up next dates, then post what is due for the "post automatically" schedules. */
  async processDue(now = new Date()) {
    const stats = { lined: 0, posted: 0, failed: 0 };

    const needing = await this.prisma.scheduledTransaction.findMany({
      where: { status: 'ACTIVE', OR: [{ nextDueAt: null }, { nextDueAt: { lte: now } }] },
      select: { id: true }, take: 200,
    });
    for (const s of needing) { await this.materialize(s.id, now); stats.lined++; }

    const due = await this.prisma.scheduledOccurrence.findMany({
      where: { status: 'PENDING', dueAt: { lte: now }, schedule: { status: 'ACTIVE', mode: 'AUTO_POST' } },
      include: { schedule: true },
      orderBy: { dueAt: 'asc' },
      take: 200,
    });
    for (const o of due) {
      try {
        await this.post(o, o.schedule, now);
        stats.posted++;
      } catch (e: any) {
        if (e instanceof Failure && e.message === ALREADY) continue;
        await this.markFailed(o, o.schedule, e instanceof Failure ? e.message : 'Something went wrong. It will not be retried automatically.', now);
        stats.failed++;
        if (!(e instanceof Failure)) this.logger.error(`posting ${o.id} failed: ${e?.message ?? e}`);
      }
    }
    return stats;
  }

  // ── Posting ────────────────────────────────────────────────────────────────

  /**
   * Creates the real transaction for one occurrence. The occurrence changes to POSTED and the transaction
   * (with its wallet movement) is created in ONE database transaction, and the transaction carries the
   * occurrence id under a unique index, so a date can never post twice or half-post.
   */
  private async post(
    occ: { id: string; dueAt: Date; scheduleId: string },
    sch: ScheduledTransaction,
    now: Date,
    over: { amount?: number; walletId?: string | null } = {},
  ) {
    // A family schedule posts as the person who made it, and only while they are still in the family and may add transactions.
    let scope: Scope;
    if (sch.familyId) {
      try { scope = await this.scopes.resolve(sch.clientId, sch.familyId); } catch { throw new Failure('The person who set this up is no longer in the family'); }
      if (isFamily(scope) && !can(scope.role, 'tx.add')) throw new Failure('The person who set this up can no longer add transactions');
    } else scope = personalScope(sch.clientId);
    const walletId = over.walletId !== undefined ? over.walletId : sch.walletId;
    const date = occ.dueAt.getTime() > now.getTime() ? now : occ.dueAt;
    const dto: CreateTransactionDto = {
      type: sch.type, category: sch.category, title: sch.title, subCategory: sch.subCategory ?? undefined,
      description: sch.description ?? undefined, amount: over.amount ?? Number(sch.amount), date: date.toISOString(), walletId: walletId ?? undefined,
    };

    let tx;
    try {
      tx = await this.prisma.$transaction(async prx => {
        const claimed = await prx.scheduledOccurrence.updateMany({
          where: { id: occ.id, status: { in: ['PENDING', 'FAILED'] } },
          data: { status: 'POSTED', handledAt: now, failReason: null },
        });
        if (claimed.count !== 1) throw new Failure(ALREADY);
        if (walletId) {
          const w = await prx.wallet.findFirst({ where: { id: walletId, ...scopeWhere(scope) } });
          if (!w) throw new Failure('The wallet no longer exists');
          if (w.archived) throw new Failure('The wallet is archived');
        }
        const created = await this.transactions.createInTx(prx, scope, dto, { scheduledOccurrenceId: occ.id });
        await prx.scheduledOccurrence.update({ where: { id: occ.id }, data: { transactionId: created.id } });
        return created;
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new Failure(ALREADY);   // the unique index caught a second post
      throw e;
    }

    if (isFamily(scope)) this.transactions.notifyFamilyCreated(scope, tx).catch(() => {});
    else this.transactions.notifyCreated(sch.clientId, tx);
    await this.reminders.syncScheduleSafe(sch.id);
    await this.materialize(sch.id, now);
    return tx;
  }

  /** Who hears about a schedule: its owner, or for a family the creator plus every owner and admin. */
  private async managersOf(sch: ScheduledTransaction): Promise<string[]> {
    if (!sch.familyId) return [sch.clientId];
    const rows = await this.prisma.familyMember.findMany({ where: { familyId: sch.familyId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } }, select: { clientId: true } });
    return [...new Set([sch.clientId, ...rows.map(r => r.clientId)])];
  }

  private async markFailed(occ: { id: string }, sch: ScheduledTransaction, reason: string, now: Date) {
    await this.prisma.scheduledOccurrence.updateMany({
      where: { id: occ.id, status: 'PENDING' }, data: { status: 'FAILED', handledAt: now, failReason: reason.slice(0, 190) },
    });
    for (const to of await this.managersOf(sch)) this.notifications.notify(to, 'Scheduled transaction failed', `${sch.title}: ${reason}`, 'transaction');
    await this.reminders.syncScheduleSafe(sch.id);
    await this.materialize(sch.id, now);
  }

  // ── What the person does with a waiting date ───────────────────────────────

  private async waitingOwned(scope: Scope, occurrenceId: string) {
    assertScopeCan(scope, 'schedule.manage');
    const occ = await this.prisma.scheduledOccurrence.findFirst({ where: { id: occurrenceId, schedule: { ...scopeWhere(scope) } }, include: { schedule: true } });
    if (!occ) throw new NotFoundException('Scheduled date not found');
    if (occ.status !== 'PENDING' && occ.status !== 'FAILED') throw new BadRequestException('This date was already handled');
    if (occ.schedule.status === 'ENDED') throw new BadRequestException('This scheduled transaction has ended');
    return occ;
  }

  /** "Pay it now" / "Mark received": creates the transaction. The amount or wallet may differ for this one date only. */
  async confirm(who: string | Scope, occurrenceId: string, dto: ConfirmOccurrenceDto = {}, now = new Date()) {
    const scope = scopeOf(who);
    const occ = await this.waitingOwned(scope, occurrenceId);
    const over: { amount?: number; walletId?: string | null } = {};
    if (dto.amount !== undefined) over.amount = this.amountOf(dto.amount);
    if (dto.walletId !== undefined) { await this.checkWallet(scope, dto.walletId); over.walletId = dto.walletId; }
    try {
      const tx = await this.post(occ, occ.schedule, now, over);
      return { occurrenceId, status: 'POSTED', transactionId: tx.id };
    } catch (e: any) {
      if (e instanceof Failure) throw new BadRequestException(e.message === ALREADY ? 'This date was already handled' : e.message);
      throw e;
    }
  }

  async skip(who: string | Scope, occurrenceId: string, now = new Date()) {
    const scope = scopeOf(who);
    const occ = await this.waitingOwned(scope, occurrenceId);
    const done = await this.prisma.scheduledOccurrence.updateMany({
      where: { id: occurrenceId, status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'SKIPPED', handledAt: now },
    });
    if (done.count !== 1) throw new BadRequestException('This date was already handled');
    await this.reminders.syncScheduleSafe(occ.scheduleId);
    await this.materialize(occ.scheduleId, now);
    return { occurrenceId, status: 'SKIPPED' };
  }
}

const ALREADY = 'already handled';
