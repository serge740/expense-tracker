import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../../generated/prisma';
import { EmailService } from '../../global/email/email.service';
import { deriveInstallments, InstallmentInput, nextUnpaid } from '../debts/debt-installments';
import { remainingOf } from '../debts/debt-accounting';
import {
  advance, buildLadder, canPush, inQuietHours, quietEnd, shouldDigest, snoozeTarget, SnoozeInput, startPlan,
} from './reminder-policy';
import { asLang, digestMessage, reminderMessage, scheduledMessage, whenText, money } from './reminder-message';
import { PushService, PushSender, PushTicket } from './push.service';

const MIN = 60_000;
/** A claimed reminder is locked this long. A crash mid-send lets it fire again afterwards instead of vanishing. */
const LEASE_MS = 2 * MIN;
const BATCH = 200;
const RECEIPT_MIN_AGE_MS = 15 * MIN;
const RECEIPT_MAX_AGE_MS = 24 * 60 * MIN;

export interface TickStats {
  claimed: number; fired: number; deferred: number; skipped: number; pushes: number; digests: number; emails: number; failed: number;
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PushService) private readonly push: PushSender,
    private readonly email: EmailService,
    @Optional() private readonly realtime?: RealtimeGateway,
  ) {}

  // Other jobs that must run at the start of every tick (e.g. posting due scheduled transactions).
  private readonly extras: Array<(now: Date) => Promise<unknown>> = [];
  onTick(job: (now: Date) => Promise<unknown>) { this.extras.push(job); }

  // ── Keeping reminders in step with debts ───────────────────────────────────

  private async prefs(clientId: string) {
    return (
      (await this.prisma.notificationPreference.findUnique({ where: { clientId } })) ??
      this.prisma.notificationPreference.create({ data: { clientId } })
    );
  }

  /** Call after anything changes a debt, its pay dates or its payments. Never throws into the caller. */
  async syncDebtSafe(debtId: string) {
    try { await this.syncDebt(debtId); } catch (e: any) { this.logger.warn(`reminder sync failed for ${debtId}: ${e?.message ?? e}`); }
  }

  /**
   * One reminder follows the next unpaid pay date of a debt that has reminders switched on.
   * Reminders of paid dates are completed; reminders of anything else are cancelled.
   */
  async syncDebt(debtId: string, now = new Date()) {
    const debt = await this.prisma.debt.findUnique({ where: { id: debtId }, include: { installments: true, reminders: true } });
    if (!debt) return;

    const rows: InstallmentInput[] = debt.installments.map(i => ({
      id: i.id, dueAt: i.dueAt, plannedAmount: i.plannedAmount == null ? null : Number(i.plannedAmount), status: i.status,
    }));
    const derived = deriveInstallments({
      amount: Number(debt.amount), writtenOff: Number(debt.writtenOffAmount), paid: Number(debt.paid), installments: rows, now,
    });
    const live = debt.status === 'OPEN' && !debt.archivedAt && debt.remindersOn;
    const next = live ? nextUnpaid(rows, derived) : null;
    const paid = new Set(derived.filter(d => d.view === 'PAID').map(d => d.id));

    // Paid off by payments = the reminders are completed. Forgiven, archived or switched off = cancelled.
    const settled = debt.status === 'SETTLED';
    for (const r of debt.reminders) {
      if (r.status !== 'ACTIVE' && r.status !== 'SNOOZED') continue;
      if (settled || (live && r.installmentId && paid.has(r.installmentId))) {
        await this.prisma.reminder.update({ where: { id: r.id }, data: { status: 'DONE', nextFireAt: null, claimedUntil: null } });
      } else if (!next || r.installmentId !== next.id) {
        await this.prisma.reminder.update({ where: { id: r.id }, data: { status: 'CANCELLED', nextFireAt: null, claimedUntil: null } });
      }
    }
    if (!next) return;

    const tz = (await this.prefs(debt.clientId)).timezone;
    const plan = startPlan(buildLadder(next.dueAt, tz), now);
    const existing = debt.reminders.find(r => r.installmentId === next.id);
    const schedule = { step: plan?.step ?? 0, nextFireAt: plan?.at ?? null };

    if (!existing) {
      await this.prisma.reminder.create({
        data: { clientId: debt.clientId, debtId: debt.id, installmentId: next.id, dueAt: next.dueAt, timezone: tz, ...schedule },
      });
    } else if (existing.status === 'DONE' || existing.status === 'CANCELLED') {
      // The date is unpaid again (a payment was undone) or the debt is back: start its timeline again.
      await this.prisma.reminder.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE', timezone: tz, snoozedUntil: null, claimedUntil: null, ...schedule },
      });
    }
    // ACTIVE / SNOOZED keep their place; DISMISSED stays dismissed because the person chose that.
  }

  /** Call after anything changes a scheduled transaction or its occurrences. Never throws into the caller. */
  async syncScheduleSafe(scheduleId: string) {
    try { await this.syncSchedule(scheduleId); } catch (e: any) { this.logger.warn(`reminder sync failed for schedule ${scheduleId}: ${e?.message ?? e}`); }
  }

  /**
   * Each waiting occurrence of an active "remind me" schedule has one reminder. Posted occurrences
   * complete theirs; skipped, failed, paused, ended or auto-posting ones have none.
   */
  async syncSchedule(scheduleId: string, now = new Date()) {
    const sch = await this.prisma.scheduledTransaction.findUnique({ where: { id: scheduleId } });
    if (!sch) return;
    const live = sch.status === 'ACTIVE' && sch.mode === 'REMIND_CONFIRM';

    const occs = await this.prisma.scheduledOccurrence.findMany({
      where: { scheduleId, OR: [{ status: 'PENDING' }, { reminder: { status: { in: ['ACTIVE', 'SNOOZED'] } } }] },
      include: { reminder: true },
    });
    for (const o of occs) {
      const r = o.reminder;
      if (o.status !== 'PENDING' || !live) {
        if (r && (r.status === 'ACTIVE' || r.status === 'SNOOZED')) {
          await this.prisma.reminder.update({
            where: { id: r.id },
            data: { status: o.status === 'POSTED' ? 'DONE' : 'CANCELLED', nextFireAt: null, claimedUntil: null },
          });
        }
        continue;
      }
      const plan = startPlan(buildLadder(o.dueAt, sch.timezone), now);
      const schedule = { step: plan?.step ?? 0, nextFireAt: plan?.at ?? null };
      if (!r) {
        await this.prisma.reminder.create({
          data: { clientId: sch.clientId, kind: 'SCHEDULED_TX', occurrenceId: o.id, dueAt: o.dueAt, timezone: sch.timezone, ...schedule },
        });
      } else if (r.status === 'DONE' || r.status === 'CANCELLED') {
        await this.prisma.reminder.update({ where: { id: r.id }, data: { status: 'ACTIVE', timezone: sch.timezone, snoozedUntil: null, claimedUntil: null, ...schedule } });
      }
    }
  }

  // ── Firing ─────────────────────────────────────────────────────────────────

  /** Fire everything that is due. Safe to call from several places: each reminder is claimed first. */
  async tick(now = new Date()): Promise<TickStats> {
    const stats: TickStats = { claimed: 0, fired: 0, deferred: 0, skipped: 0, pushes: 0, digests: 0, emails: 0, failed: 0 };
    const free = [{ claimedUntil: null }, { claimedUntil: { lt: now } }];

    // Jobs that must run first: posting due scheduled transactions, creating the next occurrences.
    for (const job of this.extras) {
      try { await job(now); } catch (e: any) { this.logger.error(`tick job failed: ${e?.message ?? e}`); }
    }

    const candidates = await this.prisma.reminder.findMany({
      where: { status: { in: ['ACTIVE', 'SNOOZED'] }, nextFireAt: { lte: now }, OR: free },
      orderBy: { nextFireAt: 'asc' },
      take: BATCH,
      select: { id: true, nextFireAt: true },
    });

    const claimed: string[] = [];
    for (const c of candidates) {
      // Conditional update: only one worker can win a given reminder at a given time.
      const won = await this.prisma.reminder.updateMany({
        where: { id: c.id, nextFireAt: c.nextFireAt, OR: free },
        data: { claimedUntil: new Date(now.getTime() + LEASE_MS) },
      });
      if (won.count === 1) claimed.push(c.id);
    }
    stats.claimed = claimed.length;
    if (!claimed.length) return stats;

    // Make sure each claimed reminder is still wanted (payment recorded, debt closed, reminders switched off…).
    const debtIds = [...new Set((await this.prisma.reminder.findMany({ where: { id: { in: claimed } }, select: { debtId: true } }))
      .map(r => r.debtId).filter((x): x is string => !!x))];
    for (const id of debtIds) await this.syncDebt(id, now);
    const scheduleIds = [...new Set((await this.prisma.reminder.findMany({
      where: { id: { in: claimed }, occurrenceId: { not: null } }, select: { occurrence: { select: { scheduleId: true } } },
    })).map(r => r.occurrence?.scheduleId).filter((x): x is string => !!x))];
    for (const id of scheduleIds) await this.syncSchedule(id, now);

    const reminders = await this.prisma.reminder.findMany({
      where: { id: { in: claimed }, status: { in: ['ACTIVE', 'SNOOZED'] } },
      include: {
        debt: true,
        installment: true,
        occurrence: { include: { schedule: { include: { wallet: { select: { currency: true } } } } } },
        client: { select: { id: true, email: true, firstName: true } },
      },
    });
    stats.skipped = claimed.length - reminders.length;

    const byClient = new Map<string, typeof reminders>();
    for (const r of reminders) byClient.set(r.clientId, [...(byClient.get(r.clientId) ?? []), r]);

    for (const [clientId, group] of byClient) {
      try {
        await this.fireGroup(clientId, group, now, stats);
      } catch (e: any) {
        // The lease expires on its own, so these reminders are retried on a later tick.
        stats.failed += group.length;
        this.logger.error(`firing reminders for ${clientId} failed: ${e?.message ?? e}`);
      }
    }
    return stats;
  }

  private async fireGroup(clientId: string, group: any[], now: Date, stats: TickStats) {
    const pref = await this.prefs(clientId);
    const client = group[0].client as { email: string; firstName: string };

    // Quiet hours: wait until they end. Nothing is lost, the whole fire is just moved.
    const quiet = { enabled: pref.quietEnabled, start: pref.quietStart, end: pref.quietEnd, tz: pref.timezone };
    if (inQuietHours(now, quiet)) {
      const until = quietEnd(now, quiet);
      await this.prisma.reminder.updateMany({ where: { id: { in: group.map(r => r.id) } }, data: { nextFireAt: until, claimedUntil: null } });
      stats.deferred += group.length;
      return;
    }

    const lang = asLang(pref.language);
    const items = group.map(r => {
      const ladder = buildLadder(r.dueAt, r.timezone);
      const step = ladder[Math.min(r.step, ladder.length - 1)];
      if (r.debt) {
        const debt = r.debt;
        const remaining = remainingOf(Number(debt.amount), Number(debt.paid), Number(debt.writtenOffAmount));
        // The pay date's own amount (an estimated payment, or one the person set), when it has one.
        const payment = r.installment?.plannedAmount != null ? Number(r.installment.plannedAmount) : null;
        const text = reminderMessage({ kind: debt.kind, person: debt.person, remaining, payment, currency: debt.currency, dueAt: r.dueAt, tz: r.timezone, step: step.kind, lang });
        return {
          r, ladder, step, remaining, text, label: debt.person as string, currency: debt.currency as string,
          who: debt.kind === 'BORROWED' ? `You pay ${debt.person}` : `Owed by ${debt.person}`,
          link: { debtId: debt.id as string }, inbox: { debtId: debt.id, kind: 'debt_payment' } as Record<string, unknown>,
        };
      }
      const sch = r.occurrence.schedule;
      const amount = Number(sch.amount);
      const currency = (sch.wallet?.currency ?? '') as string;
      const text = scheduledMessage({ type: sch.type, title: sch.title, amount, currency, dueAt: r.dueAt, tz: r.timezone, step: step.kind, lang });
      return {
        r, ladder, step, remaining: amount, text, label: sch.title as string, currency,
        who: sch.type === 'INCOME' ? `Expected income · ${sch.title}` : `Scheduled payment · ${sch.title}`,
        link: { occurrenceId: r.occurrence.id as string, scheduleId: sch.id as string },
        inbox: { occurrenceId: r.occurrence.id, scheduleId: sch.id, kind: 'scheduled_transaction' } as Record<string, unknown>,
      };
    });

    // Inbox: one row per reminder, refreshed on every fire (not a new row each time).
    const notificationIds = new Map<string, string>();
    if (pref.inAppEnabled) {
      for (const it of items) {
        const data = { reminderId: it.r.id, ...it.inbox };
        const fields = { title: it.text.title, body: it.text.body, type: 'reminder' as const, channel: 'in_app' as const, read: false, data, createdAt: now };
        if (it.r.notificationId && (await this.prisma.notification.findUnique({ where: { id: it.r.notificationId } }))) {
          await this.prisma.notification.update({ where: { id: it.r.notificationId }, data: fields });
          notificationIds.set(it.r.id, it.r.notificationId);
        } else {
          notificationIds.set(it.r.id, (await this.prisma.notification.create({ data: { clientId, ...fields } })).id);
        }
      }
    }

    // Tell an open app right away, so the popup and the unread count do not wait for the next poll.
    this.realtime?.emitToClient(clientId, 'new-notification', { type: 'reminder' });

    // Push: respects the switch, the daily cap, and collapses a pile-up into one digest.
    const pushOn = pref.pushEnabled && pref.remindersPush;
    const sent24h = pushOn ? await this.pushesInLast24h(clientId, now) : 0;
    const tickets = new Map<string, PushTicket[]>();
    const pushed = new Set<string>();
    let reason: string | null = pushOn ? null : 'push-off';
    const digest = pushOn && shouldDigest(items.length);

    if (pushOn && digest && canPush(sent24h, pref.dailyPushCap)) {
      const d = digestMessage(items.map(i => ({ person: i.label, remaining: i.remaining, currency: i.currency })), lang);
      const t = await this.push.sendToClient(clientId, {
        ...d, categoryId: 'reminder', data: { type: 'reminder', digest: true, reminderIds: items.map(i => i.r.id) },
      });
      tickets.set(items[0].r.id, t);
      items.forEach(i => pushed.add(i.r.id));
      stats.pushes++; stats.digests++;
    } else if (pushOn && !digest) {
      let sent = sent24h;
      for (const it of items) {
        if (!canPush(sent, pref.dailyPushCap)) { reason = 'cap'; continue; }
        const t = await this.push.sendToClient(clientId, {
          title: it.text.title, body: it.text.body, categoryId: 'reminder',
          data: { type: 'reminder', reminderId: it.r.id, ...it.link, notificationId: notificationIds.get(it.r.id) },
        });
        tickets.set(it.r.id, t);
        pushed.add(it.r.id);
        sent++; stats.pushes++;
      }
    } else if (pushOn) {
      reason = 'cap';
    }

    // Email: only on the steps marked for it (first lead, due time, once a day when late).
    const emailed = new Set<string>();
    if (pref.emailEnabled && pref.remindersEmail && client.email) {
      for (const it of items.filter(i => i.step.email)) {
        try {
          await this.email.sendEmail(client.email, it.text.title, 'reminder', {
            firstName: client.firstName, headline: it.text.headline, body: it.text.body, late: it.text.late,
            person: it.label, whoLine: it.who, amount: money(it.remaining, it.currency), dueText: whenText(it.r.dueAt, it.r.timezone, lang),
          });
          emailed.add(it.r.id); stats.emails++;
        } catch (e: any) {
          this.logger.warn(`reminder email failed: ${e?.message ?? e}`);
        }
      }
    }

    // Log the fire and move every reminder to its next rung.
    for (const it of items) {
      const nextPlan = advance(it.ladder, it.r.step, now);
      const t = tickets.get(it.r.id) ?? [];
      await this.prisma.reminderFire.create({
        data: {
          reminderId: it.r.id, step: it.r.step, firedAt: now,
          channels: { push: pushed.has(it.r.id), email: emailed.has(it.r.id), inApp: notificationIds.has(it.r.id), digest, ...(reason ? { reason } : {}) },
          ...(t.length ? { pushTickets: t as any } : {}),
        },
      });
      await this.prisma.reminder.update({
        where: { id: it.r.id },
        data: {
          status: 'ACTIVE', snoozedUntil: null, claimedUntil: null, fireCount: { increment: 1 }, lastFiredAt: now,
          ...(notificationIds.has(it.r.id) ? { notificationId: notificationIds.get(it.r.id) } : {}),
          step: nextPlan?.step ?? it.r.step, nextFireAt: nextPlan?.at ?? null,
        },
      });
      stats.fired++;
    }
  }

  private async pushesInLast24h(clientId: string, now: Date) {
    return this.prisma.reminderFire.count({
      where: {
        reminder: { clientId }, firedAt: { gt: new Date(now.getTime() - 24 * 60 * MIN) },
        channels: { path: '$.push', equals: true },
      },
    });
  }

  // ── What the app asks for ──────────────────────────────────────────────────

  /** Reminders that fired and are still waiting for the person (not snoozed), most urgent first. */
  async pending(clientId: string, now = new Date()) {
    const rows = await this.prisma.reminder.findMany({
      where: {
        clientId, lastFiredAt: { not: null },
        OR: [{ status: 'ACTIVE' }, { status: 'SNOOZED', snoozedUntil: { lte: now } }],
      },
      include: { debt: true, installment: true, occurrence: { include: { schedule: { include: { wallet: { select: { currency: true } } } } } } },
      orderBy: { dueAt: 'asc' },
    });
    const common = (r: (typeof rows)[number]) => ({
      id: r.id, dueAt: r.dueAt, overdue: r.dueAt.getTime() < now.getTime(), fireCount: r.fireCount, lastFiredAt: r.lastFiredAt,
    });
    const out: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      if (r.debt) {
        const d = r.debt;
        const remaining = remainingOf(Number(d.amount), Number(d.paid), Number(d.writtenOffAmount));
        out.push({
          ...common(r), source: 'DEBT', debtId: d.id, kind: d.kind, person: d.person, currency: d.currency, walletId: d.walletId,
          remaining,
          // This pay date's own amount (an estimated payment), never more than what is left.
          payment: r.installment?.plannedAmount != null ? Math.min(remaining, Number(r.installment.plannedAmount)) : null,
        });
      } else if (r.occurrence) {
        const s = r.occurrence.schedule;
        out.push({
          ...common(r), source: 'SCHEDULED', occurrenceId: r.occurrence.id, scheduleId: s.id, txType: s.type, title: s.title,
          currency: s.wallet?.currency ?? '', amount: Number(s.amount), remaining: Number(s.amount), walletId: s.walletId,
        });
      }
    }
    return out;
  }

  private async mine(clientId: string, id: string) {
    const r = await this.prisma.reminder.findFirst({ where: { id, clientId } });
    if (!r) throw new NotFoundException('Reminder not found');
    return r;
  }

  private async markLastFire(reminderId: string, action: 'OPENED' | 'SNOOZED' | 'DONE' | 'DISMISSED') {
    const last = await this.prisma.reminderFire.findFirst({ where: { reminderId }, orderBy: { firedAt: 'desc' } });
    if (last) await this.prisma.reminderFire.update({ where: { id: last.id }, data: { action, actedAt: new Date() } });
  }

  async snooze(clientId: string, id: string, input: { minutes?: number; until?: string }, now = new Date()) {
    const r = await this.mine(clientId, id);
    if (r.status !== 'ACTIVE' && r.status !== 'SNOOZED') throw new BadRequestException('This reminder is already closed');
    let target: Date;
    try {
      const arg: SnoozeInput = input.until ? { until: new Date(input.until) } : { minutes: Number(input.minutes) };
      target = snoozeTarget(now, arg);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
    await this.prisma.reminder.update({ where: { id }, data: { status: 'SNOOZED', snoozedUntil: target, nextFireAt: target, claimedUntil: null } });
    await this.markLastFire(id, 'SNOOZED');
    return { id, snoozedUntil: target };
  }

  /** End a snooze early: the reminder fires on the next tick. */
  async wake(clientId: string, id: string, now = new Date()) {
    const r = await this.mine(clientId, id);
    if (r.status !== 'SNOOZED') throw new BadRequestException('This reminder is not snoozed');
    await this.prisma.reminder.update({ where: { id }, data: { status: 'ACTIVE', snoozedUntil: null, nextFireAt: now, claimedUntil: null } });
    return { id };
  }

  async done(clientId: string, id: string) { return this.close(clientId, id, 'DONE'); }
  async dismiss(clientId: string, id: string) { return this.close(clientId, id, 'DISMISSED'); }

  private async close(clientId: string, id: string, status: 'DONE' | 'DISMISSED') {
    const r = await this.mine(clientId, id);
    if (r.status === 'DONE' || r.status === 'DISMISSED' || r.status === 'CANCELLED') return { id, status: r.status };
    await this.prisma.reminder.update({ where: { id }, data: { status, nextFireAt: null, snoozedUntil: null, claimedUntil: null } });
    await this.markLastFire(id, status);
    if (r.notificationId) await this.prisma.notification.updateMany({ where: { id: r.notificationId, clientId }, data: { read: true } });
    return { id, status };
  }

  /** The person opened the reminder (tap on the push or the modal). Logged, nothing else changes. */
  async opened(clientId: string, id: string) {
    await this.mine(clientId, id);
    await this.markLastFire(id, 'OPENED');
    return { id };
  }

  // ── Delivery receipts ──────────────────────────────────────────────────────

  /** About 15 minutes after a push, ask Expo whether it arrived and forget devices that are gone. */
  async checkReceipts(now = new Date()) {
    const fires = await this.prisma.reminderFire.findMany({
      where: {
        pushTickets: { not: Prisma.DbNull }, receiptsCheckedAt: null,
        firedAt: { lt: new Date(now.getTime() - RECEIPT_MIN_AGE_MS), gt: new Date(now.getTime() - RECEIPT_MAX_AGE_MS) },
      },
      take: 200,
    });
    const withTickets = fires.filter(f => Array.isArray(f.pushTickets) && (f.pushTickets as any[]).length > 0);
    const result = await this.push.checkReceipts(withTickets.flatMap(f => f.pushTickets as unknown as PushTicket[]));
    if (fires.length) {
      await this.prisma.reminderFire.updateMany({ where: { id: { in: fires.map(f => f.id) } }, data: { receiptsCheckedAt: now } });
    }
    return { checked: fires.length, ...result };
  }
}
