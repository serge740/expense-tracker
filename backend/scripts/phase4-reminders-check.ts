/**
 * Phase 4 end-to-end check of the reminder engine. Runs the REAL RemindersService / DebtsService against
 * whatever DATABASE_URL points to (with fake push + email, and a simulated clock), so ONLY run it on a scratch copy:
 *
 *   DATABASE_URL="mysql://root@localhost:3306/expense_p3_test" npx ts-node scripts/phase4-reminders-check.ts
 *
 * It creates its own clients and removes everything it created at the end.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { DebtsService } from '../src/modules/debts/debts.service';
import { RemindersTickController } from '../src/modules/reminders/reminders.controller';
import { buildLadder, zonedToUtc } from '../src/modules/reminders/reminder-policy';
import { makeReminders } from './_fakes';

let failures = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`}`);
};
const rejects = async (label: string, fn: () => Promise<unknown>, part: string) => {
  try { await fn(); check(label, 'no error', `error containing "${part}"`); }
  catch (e: any) { check(label, String(e?.message).includes(part), true); }
};

const TZ = 'Africa/Kigali';
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const at = (ms: number) => new Date(ms);

async function main() {
  if (!/p1test|scratch|_test/i.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('Refusing to run: DATABASE_URL must point at a scratch database (name containing p1test / scratch / _test).');
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  const notifications = new NotificationsService(prisma);
  notifications.notify = () => undefined;
  const { reminders, push, email } = makeReminders(prisma);
  const debts = new DebtsService(prisma, notifications, reminders);

  // The tick is global, so start from an empty reminder table (scratch database only, guarded above).
  await prisma.reminder.deleteMany({});

  const stamp = Date.now();
  const made: string[] = [];
  let n = 0;
  const newClient = async (prefs: Record<string, unknown> = {}) => {
    n++;
    const c = await prisma.client.create({ data: { firstName: `Check${n}`, email: `p4check${stamp}_${n}@example.com`, phone: `+000${stamp}${n}`, isVerified: true } });
    made.push(c.id);
    await prisma.notificationPreference.create({ data: { clientId: c.id, timezone: TZ, ...prefs } });
    await prisma.device.create({ data: { clientId: c.id, deviceName: 'Test', platform: 'android', pushToken: 'ExponentPushToken[fake]' } });
    return c.id;
  };
  const pushesTo = (cid: string) => push.sent.filter(p => p.clientId === cid);
  const reminderOf = async (debtId: string) => prisma.reminder.findMany({ where: { debtId }, orderBy: { createdAt: 'asc' } });
  const due3d = () => { const d = new Date(Date.now() + 3 * DAY); d.setSeconds(0, 0); return d; };

  try {
    // ── 1. Creating a debt creates a reminder; a credit gets none by default ──
    const A = await newClient();
    const due = due3d();
    const ladder = buildLadder(due, TZ);
    let d = await debts.create(A, { kind: 'BORROWED', person: 'John', amount: 150000, currency: 'RWF', dueDate: due.toISOString() });
    check('debt: reminders are on by default', d.remindersOn, true);
    let rs = await reminderOf(d.id);
    check('debt: one reminder, first rung is "1 day before"', [rs.length, rs[0].step, rs[0].nextFireAt?.getTime()], [1, 0, ladder[0].at.getTime()]);
    check('debt: reminder is tied to the pay date', !!rs[0].installmentId, true);

    const credit = await debts.create(A, { kind: 'LENT', person: 'Eric', amount: 5000, currency: 'RWF', dueDate: due.toISOString() });
    check('credit: reminders are off by default', [credit.remindersOn, (await reminderOf(credit.id)).length], [false, 0]);

    // ── 2. Nothing fires early; fires once when due ───────────────────────────
    check('tick before the first rung does nothing', (await reminders.tick(at(ladder[0].at.getTime() - MIN))).claimed, 0);

    const t0 = at(ladder[0].at.getTime() + MIN);
    let s = await reminders.tick(t0);
    check('first rung: fired 1, pushed 1, emailed 1', [s.fired, s.pushes, s.emails], [1, 1, 1]);
    check('push says "due tomorrow" with the debt link', [pushesTo(A)[0].payload.title, (pushesTo(A)[0].payload.data as any).debtId], ['Payment due tomorrow', d.id]);
    check('push carries the action-button category', pushesTo(A)[0].payload.categoryId, 'reminder');
    check('email uses the reminder template', [email.sent[0].template, email.sent[0].to.startsWith('p4check')], ['reminder', true]);
    let inbox = await prisma.notification.findMany({ where: { clientId: A, type: 'reminder' } });
    check('inbox: one unread reminder row', [inbox.length, inbox[0].read], [1, false]);
    rs = await reminderOf(d.id);
    check('reminder moved to the next rung ("1 hour before")', [rs[0].step, rs[0].fireCount, rs[0].nextFireAt?.getTime()], [1, 1, ladder[1].at.getTime()]);
    check('a fire was logged', await prisma.reminderFire.count({ where: { reminderId: rs[0].id } }), 1);

    check('same time again: nothing (no double send)', (await reminders.tick(t0)).claimed, 0);

    // ── 3. Two workers at once send once ─────────────────────────────────────
    const tHour = at(ladder[1].at.getTime() + MIN);
    const before = pushesTo(A).length;
    const [x, y] = await Promise.all([reminders.tick(tHour), reminders.tick(tHour)]);
    check('two simultaneous ticks: exactly one fire', [x.fired + y.fired, pushesTo(A).length - before], [1, 1]);
    check('a short re-fire does not email', email.sent.length, 1);

    // ── 4. Due time: same inbox row refreshed, emailed again ──────────────────
    const tDue = at(due.getTime() + MIN);
    s = await reminders.tick(tDue);
    check('due time: pushed + emailed', [s.pushes, s.emails], [1, 1]);
    check('due time wording', pushesTo(A).at(-1)!.payload.title, 'Payment due now');
    inbox = await prisma.notification.findMany({ where: { clientId: A, type: 'reminder' } });
    check('inbox: still ONE row (refreshed, not duplicated)', [inbox.length, inbox[0].read, inbox[0].title], [1, false, 'Payment due now']);

    // ── 5. Pending list, snooze ───────────────────────────────────────────────
    let pend = await reminders.pending(A, tDue);
    check('pending: shows the fired reminder with amount left', [pend.length, pend[0].remaining, pend[0].person], [1, 150000, 'John']);
    const rid = rs[0].id;
    await rejects('snooze: 7 minutes is not a choice', () => reminders.snooze(A, rid, { minutes: 7 }, tDue), 'Choose');
    await rejects('snooze: a past custom time is refused', () => reminders.snooze(A, rid, { until: at(tDue.getTime() - HOUR).toISOString() }, tDue), 'future');
    const sn = await reminders.snooze(A, rid, { minutes: 30 }, tDue);
    check('snooze 30 min: status and wake time', [(await prisma.reminder.findUniqueOrThrow({ where: { id: rid } })).status, sn.snoozedUntil.getTime()], ['SNOOZED', tDue.getTime() + 30 * MIN]);
    check('snoozed reminder leaves the pending list', (await reminders.pending(A, tDue)).length, 0);
    check('snooze: nothing fires 29 min later', (await reminders.tick(at(tDue.getTime() + 29 * MIN))).claimed, 0);
    const pushesBefore = pushesTo(A).length;
    s = await reminders.tick(at(tDue.getTime() + 31 * MIN));
    check('snooze: fires again after 30 min and is active again', [s.fired, pushesTo(A).length - pushesBefore, (await prisma.reminder.findUniqueOrThrow({ where: { id: rid } })).status], [1, 1, 'ACTIVE']);
    check('snooze was logged on the earlier fire', (await prisma.reminderFire.count({ where: { reminderId: rid, action: 'SNOOZED' } })), 1);
    const custom = await reminders.snooze(A, rid, { until: at(tDue.getTime() + 3 * DAY).toISOString() }, at(tDue.getTime() + 31 * MIN));
    check('snooze: custom date accepted', custom.snoozedUntil.getTime(), tDue.getTime() + 3 * DAY);

    // ── 6. Paying completes the reminder; undoing restarts it ────────────────
    d = await debts.addPayment(A, d.id, { amount: 150000 });
    check('paid in full: reminder is DONE', (await prisma.reminder.findUniqueOrThrow({ where: { id: rid } })).status, 'DONE');
    check('paid: nothing left to fire', (await reminders.tick(at(tDue.getTime() + 5 * DAY))).claimed, 0);
    check('paid: pending list empty', (await reminders.pending(A, tDue)).length, 0);
    d = await debts.removePayment(A, d.id, d.payments[0].id);
    const again = await prisma.reminder.findUniqueOrThrow({ where: { id: rid } });
    check('payment undone: same reminder is ACTIVE again with a fresh schedule', [again.status, !!again.nextFireAt], ['ACTIVE', true]);

    // ── 7. Moving a pay date moves the reminder ──────────────────────────────
    const inst = (await prisma.debtInstallment.findMany({ where: { debtId: d.id, status: 'PENDING' } }))[0];
    const newDue = at(due.getTime() + 10 * DAY);
    d = await debts.moveInstallment(A, d.id, inst.id, { dueAt: newDue.toISOString() });
    rs = await reminderOf(d.id);
    check('move: old reminder cancelled, new one follows the new date', [rs.map(r => r.status).sort(), rs.find(r => r.status === 'ACTIVE')?.dueAt.getTime()], [['ACTIVE', 'CANCELLED'], newDue.getTime()]);

    // ── 8. Dismiss stops it for good ─────────────────────────────────────────
    const live = rs.find(r => r.status === 'ACTIVE')!;
    await reminders.dismiss(A, live.id);
    await reminders.syncDebt(d.id);
    check('dismissed stays dismissed after a re-sync', (await prisma.reminder.findUniqueOrThrow({ where: { id: live.id } })).status, 'DISMISSED');

    // ── 9. Switching reminders off / forgiving cancels ───────────────────────
    const B = await newClient();
    let e = await debts.create(B, { kind: 'BORROWED', person: 'Aline', amount: 1000, currency: 'RWF', dueDate: due3d().toISOString() });
    e = await debts.update(B, e.id, { remindersOn: false });
    check('reminders switched off: cancelled', (await reminderOf(e.id)).map(r => r.status), ['CANCELLED']);
    e = await debts.update(B, e.id, { remindersOn: true });
    check('switched back on: same reminder is live again', (await reminderOf(e.id)).map(r => r.status), ['ACTIVE']);
    e = await debts.writeOff(B, e.id);
    check('forgiven: reminder cancelled', (await reminderOf(e.id)).map(r => r.status), ['CANCELLED']);

    // ── 10. A date that is already overdue fires once straight away ──────────
    const C = await newClient();
    const late = await debts.create(C, { kind: 'BORROWED', person: 'Marie', amount: 2000, currency: 'RWF', dueDate: new Date(Date.now() - 2 * DAY).toISOString() });
    const lr = (await reminderOf(late.id))[0];
    check('already overdue: due immediately', lr.nextFireAt!.getTime() <= Date.now() + 1000, true);
    s = await reminders.tick(at(Date.now() + 1000));
    check('already overdue: fires once with overdue wording', [s.fired, pushesTo(C)[0].payload.title], [1, 'Payment overdue']);
    check('already overdue: next rung is in the future (no burst)', (await prisma.reminder.findUniqueOrThrow({ where: { id: lr.id } })).nextFireAt!.getTime() > Date.now(), true);

    // ── 11. Quiet hours wait, then fire ──────────────────────────────────────
    const Q = await newClient({ quietEnabled: true, quietStart: '22:00', quietEnd: '07:00' });
    const dq = due3d();
    const lq = buildLadder(dq, TZ);
    const qd = await debts.create(Q, { kind: 'BORROWED', person: 'Quiet', amount: 100, currency: 'RWF', dueDate: dq.toISOString() });
    const night = zonedToUtc({ y: lq[0].at.getUTCFullYear(), m: lq[0].at.getUTCMonth() + 1, d: lq[0].at.getUTCDate() + 1, h: 23, mi: 0 }, TZ);
    s = await reminders.tick(night);
    const morning = zonedToUtc({ y: night.getUTCFullYear(), m: night.getUTCMonth() + 1, d: night.getUTCDate() + 1, h: 7, mi: 0 }, TZ);
    const qr = (await reminderOf(qd.id))[0];
    // (the tick is global, so other clients' reminders may fire in the same call; look at this client only)
    check('quiet hours: deferred, nothing sent', [s.deferred >= 1, qr.fireCount, pushesTo(Q).length], [true, 0, 0]);
    check('quiet hours: moved to the end of quiet time', qr.nextFireAt!.getTime(), morning.getTime());
    check('quiet hours: still on the same rung', qr.step, 0);
    s = await reminders.tick(at(morning.getTime() + MIN));
    // (the tick is global, so other clients' reminders may fire in the same call; look at this client only)
    check('after quiet hours: fires', [s.fired >= 1, (await reminderOf(qd.id))[0].fireCount, pushesTo(Q).length], [true, 1, 1]);

    // ── 12. Daily cap ────────────────────────────────────────────────────────
    const K = await newClient({ dailyPushCap: 1 });
    const dk = due3d();
    const lk = buildLadder(dk, TZ);
    const kd = await debts.create(K, { kind: 'BORROWED', person: 'Cap', amount: 100, currency: 'RWF', dueDate: dk.toISOString() });
    await reminders.tick(at(lk[0].at.getTime() + MIN));
    const inboxBefore = (await prisma.notification.findMany({ where: { clientId: K, type: 'reminder' } }))[0];
    await reminders.tick(at(lk[1].at.getTime() + MIN));
    const kr = (await reminderOf(kd.id))[0];
    const capFire = await prisma.reminderFire.findFirst({ where: { reminderId: kr.id }, orderBy: { firedAt: 'desc' } });
    check('daily cap 1: second push held back', pushesTo(K).length, 1);
    check('daily cap: the fire is logged with the reason', [(capFire!.channels as any).push, (capFire!.channels as any).reason], [false, 'cap']);
    const inboxAfter = (await prisma.notification.findMany({ where: { clientId: K, type: 'reminder' } }))[0];
    check('daily cap: inbox still updated', [inboxAfter.id === inboxBefore.id, inboxAfter.read], [true, false]);

    // ── 13. Digest for a pile-up ─────────────────────────────────────────────
    const G = await newClient();
    const dg = due3d();
    const lg = buildLadder(dg, TZ);
    for (const p of ['P1', 'P2', 'P3']) await debts.create(G, { kind: 'BORROWED', person: p, amount: 500, currency: 'RWF', dueDate: dg.toISOString() });
    s = await reminders.tick(at(lg[0].at.getTime() + MIN));
    check('three at once: one digest push, three fires', [s.digests, pushesTo(G).length, s.fired], [1, 1, 3]);
    check('digest wording', pushesTo(G)[0].payload.title, '3 payments need attention');
    check('digest: each reminder still has its own inbox row', await prisma.notification.count({ where: { clientId: G, type: 'reminder' } }), 3);

    // ── 14. Push off ─────────────────────────────────────────────────────────
    const O = await newClient({ pushEnabled: false });
    const od = due3d();
    const lo = buildLadder(od, TZ);
    await debts.create(O, { kind: 'BORROWED', person: 'Off', amount: 100, currency: 'RWF', dueDate: od.toISOString() });
    s = await reminders.tick(at(lo[0].at.getTime() + MIN));
    check('push switched off: no push, inbox + email still go', [pushesTo(O).length, await prisma.notification.count({ where: { clientId: O, type: 'reminder' } }), s.emails], [0, 1, 1]);

    // ── 15. Receipts ─────────────────────────────────────────────────────────
    const rc = await reminders.checkReceipts(at(t0.getTime() + 20 * MIN));
    check('receipts: checked once and marked', [rc.checked >= 1, push.receiptsFor.length >= 1], [true, true]);
    check('receipts: not checked twice', (await reminders.checkReceipts(at(t0.getTime() + 21 * MIN))).checked, 0);

    // ── 16. Security + the tick URL ──────────────────────────────────────────
    await rejects('security: another person cannot snooze my reminder', () => reminders.snooze(B, rid, { minutes: 10 }, tDue), 'not found');
    const ctl = new RemindersTickController(reminders);
    delete process.env.REMINDER_TICK_KEY;
    await rejects('tick URL: does not exist without a key configured', () => ctl.tick('anything'), 'Not Found');
    process.env.REMINDER_TICK_KEY = 'secret-key-123';
    await rejects('tick URL: wrong key refused', () => ctl.tick('nope'), 'Not Found');
    await rejects('tick URL: missing key refused', () => ctl.tick(undefined), 'Not Found');
    const ok: any = await ctl.tick('secret-key-123');
    check('tick URL: right key runs the engine', [ok.ok, typeof ok.fired.claimed], [true, 'number']);

    // ── 16b. Debt shows its next reminder; wake ends a snooze; reminder text follows the language ──
    const W = await newClient({ language: 'fr' });
    const dw = due3d();
    const lw = buildLadder(dw, TZ);
    const wd = await debts.create(W, { kind: 'BORROWED', person: 'Jean', amount: 5000, currency: 'RWF', dueDate: dw.toISOString() });
    check('debt returns the next reminder time and id', [new Date(wd.nextReminderAt).getTime(), !!wd.reminderId, wd.reminderStatus], [lw[0].at.getTime(), true, 'ACTIVE']);
    await reminders.tick(at(lw[0].at.getTime() + MIN));
    check('language fr: push is in French', pushesTo(W)[0].payload.title, 'Paiement dû demain');
    const wr = (await reminderOf(wd.id))[0];
    await rejects('wake: only a snoozed reminder can be woken', () => reminders.wake(W, wr.id), 'not snoozed');
    await reminders.snooze(W, wr.id, { minutes: 60 }, at(lw[0].at.getTime() + MIN));
    await reminders.wake(W, wr.id, at(lw[0].at.getTime() + 2 * MIN));
    const woke = await prisma.reminder.findUniqueOrThrow({ where: { id: wr.id } });
    check('wake: active again and due right away', [woke.status, woke.snoozedUntil, woke.nextFireAt!.getTime()], ['ACTIVE', null, lw[0].at.getTime() + 2 * MIN]);
    const snoozed = await debts.findOne(W, wd.id);
    check('debt shows no snooze after wake', snoozed.reminderStatus, 'ACTIVE');
    await rejects('prefs: unknown language refused', () => notifications.updatePreferences(W, { language: 'xx' }), 'language');

    // ── 17. Preference validation ────────────────────────────────────────────
    await rejects('prefs: unknown time zone refused', () => notifications.updatePreferences(A, { timezone: 'Mars/Base' }), 'time zone');
    await rejects('prefs: bad clock refused', () => notifications.updatePreferences(A, { quietStart: '25:00' }), 'time like');
    await rejects('prefs: daily limit 0 refused', () => notifications.updatePreferences(A, { dailyPushCap: 0 }), 'between 1 and 50');
    const saved = await notifications.updatePreferences(A, { timezone: 'Africa/Nairobi', quietEnabled: true, quietStart: '9:30', dailyPushCap: 5 });
    check('prefs: valid values saved (and "9:30" padded)', [saved.timezone, saved.quietEnabled, saved.quietStart, saved.dailyPushCap], ['Africa/Nairobi', true, '09:30', 5]);
  } finally {
    await prisma.client.deleteMany({ where: { id: { in: made } } });
    await prisma.$disconnect();
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
