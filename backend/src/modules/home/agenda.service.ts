import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DebtsService } from '../debts/debts.service';
import { ScheduledService } from '../scheduled/scheduled.service';
import { AgendaItem, LastScheduled, sortAgenda } from './agenda';
import { Scope, isFamily, personalScope, scopeWhere } from '../family/scope/scope';

/** Scheduled transactions and loan / credit pay dates, as one list of "what is coming" (personal only). */
@Injectable()
export class AgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly debts: DebtsService,
    private readonly scheduled: ScheduledService,
  ) {}

  async build(who: string | Scope, now = new Date()): Promise<{ items: AgendaItem[]; last: LastScheduled | null; scheduleCount: number }> {
    const scope = typeof who === 'string' ? personalScope(who) : who;
    const where = scopeWhere(scope);
    const [waiting, failedRows, upcoming, debts, lastOcc, scheduleCount] = await Promise.all([
      this.scheduled.waiting(scope, now),
      this.prisma.scheduledOccurrence.findMany({
        where: { status: 'FAILED', schedule: { ...where, status: 'ACTIVE' } },
        include: { schedule: { include: { wallet: { select: { currency: true } } } } }, orderBy: { dueAt: 'desc' }, take: 20,
      }),
      this.prisma.scheduledTransaction.findMany({
        where: { ...where, status: 'ACTIVE', nextDueAt: { not: null } },
        include: { wallet: { select: { currency: true } } },
      }),
      this.debts.list(scope, 'OPEN'),
      this.prisma.scheduledOccurrence.findFirst({
        where: { status: { in: ['POSTED', 'SKIPPED', 'FAILED'] }, dueAt: { lt: now }, schedule: { ...where } },
        orderBy: { dueAt: 'desc' }, include: { schedule: { select: { title: true } } },
      }),
      this.prisma.scheduledTransaction.count({ where: { ...where, status: { in: ['ACTIVE', 'PAUSED'] } } }),
    ]);

    const items: AgendaItem[] = [];
    const hasWaiting = new Set<string>();
    for (const w of waiting) {
      hasWaiting.add(w.scheduleId);
      items.push({
        key: `occ:${w.id}`, source: 'SCHEDULED', refId: w.scheduleId, occurrenceId: w.id, title: w.title, person: null, dueAt: new Date(w.dueAt), overdue: w.overdue,
        waiting: true, failed: false, failReason: null, amount: w.amount, currency: w.currency, direction: w.type === 'INCOME' ? 'IN' : 'OUT',
      });
    }
    // A date that could not post stays in view with the reason, so it can be retried (or skipped).
    for (const o of failedRows) {
      hasWaiting.add(o.scheduleId);
      items.push({
        key: `occ:${o.id}`, source: 'SCHEDULED', refId: o.scheduleId, occurrenceId: o.id, title: o.schedule.title, person: null, dueAt: o.dueAt, overdue: o.dueAt.getTime() < now.getTime(),
        waiting: true, failed: true, failReason: o.failReason ?? null, amount: Number(o.schedule.amount), currency: o.schedule.wallet?.currency ?? '', direction: o.schedule.type === 'INCOME' ? 'IN' : 'OUT',
      });
    }
    for (const s of upcoming) {
      // A schedule with a date waiting already shows that date.
      if (hasWaiting.has(s.id) || !s.nextDueAt || s.nextDueAt.getTime() <= now.getTime()) continue;
      items.push({
        key: `sch:${s.id}`, source: 'SCHEDULED', refId: s.id, occurrenceId: null, title: s.title, person: null, dueAt: s.nextDueAt, overdue: false, waiting: false, failed: false, failReason: null,
        amount: Number(s.amount), currency: s.wallet?.currency ?? '', direction: s.type === 'INCOME' ? 'IN' : 'OUT',
      });
    }
    for (const d of debts) {
      const due = d.nextDueAt ?? d.dueDate;
      if (!due || d.archived) continue;
      items.push({
        key: `debt:${d.id}`, source: d.kind === 'BORROWED' ? 'DEBT' : 'CREDIT', refId: d.id, occurrenceId: null,
        title: d.kind === 'BORROWED' ? `Pay ${d.person}` : `${d.person} owes you`, person: d.person, dueAt: new Date(due), overdue: !!d.overdue, waiting: false, failed: false, failReason: null,
        amount: d.nextPayment ?? d.remaining, currency: d.currency, direction: d.kind === 'BORROWED' ? 'OUT' : 'IN',
      });
    }

    let last: LastScheduled | null = null;
    if (lastOcc) last = { title: lastOcc.schedule.title, at: lastOcc.dueAt, status: lastOcc.status as LastScheduled['status'] };
    else {
      const newest = await this.prisma.scheduledTransaction.findFirst({ where: { ...where }, orderBy: { createdAt: 'desc' }, select: { title: true, createdAt: true } });
      if (newest) last = { title: newest.title, at: newest.createdAt, status: 'CREATED' };
    }
    return { items: sortAgenda(items), last, scheduleCount };
  }
}
