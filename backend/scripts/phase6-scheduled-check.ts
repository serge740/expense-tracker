/**
 * Phase 6 end-to-end check of scheduled and recurring transactions. Runs the REAL ScheduledService,
 * RemindersService and TransactionService against whatever DATABASE_URL points to (fake push + email,
 * simulated clock), so ONLY run it on a scratch copy:
 *
 *   DATABASE_URL="mysql://root@localhost:3306/expense_p3_test" npx ts-node scripts/phase6-scheduled-check.ts
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { TransactionService } from '../src/modules/transaction/transaction.service';
import { ScheduledService, CATCH_UP_CAP } from '../src/modules/scheduled/scheduled.service';
import { buildLadder, zonedToUtc } from '../src/modules/reminders/reminder-policy';
import { blankRule, RepeatRule } from '../src/modules/scheduled/recurrence';
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
const rule = (o: Partial<RepeatRule>): RepeatRule => ({ ...blankRule('DAY'), ...o });

async function main() {
  if (!/p1test|scratch|_test/i.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('Refusing to run: DATABASE_URL must point at a scratch database (name containing p1test / scratch / _test).');
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  const notified: { clientId: string; title: string; body: string }[] = [];
  const notifications = new NotificationsService(prisma);
  notifications.notify = ((clientId: string, title: string, body: string) => { notified.push({ clientId, title, body }); }) as any;
  const { reminders, push, email } = makeReminders(prisma);
  const transactions = new TransactionService(prisma, notifications);
  const scheduled = new ScheduledService(prisma, transactions, notifications, reminders, null as never);
  scheduled.onModuleInit();

  // The tick is global: start from empty tables (scratch database only, guarded above).
  await prisma.reminder.deleteMany({});
  await prisma.scheduledTransaction.deleteMany({});

  const stamp = Date.now();
  const made: string[] = [];
  let n = 0;
  const newClient = async (prefs: Record<string, unknown> = {}) => {
    n++;
    const c = await prisma.client.create({ data: { firstName: `Sched${n}`, email: `p6check${stamp}_${n}@example.com`, phone: `+000${stamp}${n}`, isVerified: true } });
    made.push(c.id);
    await prisma.notificationPreference.create({ data: { clientId: c.id, timezone: TZ, ...prefs } });
    await prisma.device.create({ data: { clientId: c.id, deviceName: 'T', platform: 'android', pushToken: 'ExponentPushToken[fake]' } });
    return c.id;
  };
  const wallet = (cid: string, balance = 100000, extra: Record<string, unknown> = {}) =>
    prisma.wallet.create({ data: { clientId: cid, name: 'Main', bank: 'Test', currency: 'RWF', balance, ...extra } });
  const bal = async (id: string) => Number((await prisma.wallet.findUniqueOrThrow({ where: { id } })).balance);
  const pending = (sid: string) => prisma.scheduledOccurrence.findMany({ where: { scheduleId: sid, status: 'PENDING' }, orderBy: { dueAt: 'asc' } });
  const occs = (sid: string) => prisma.scheduledOccurrence.findMany({ where: { scheduleId: sid }, orderBy: { dueAt: 'asc' } });
  const posted = async (sid: string) => {
    const ids = (await occs(sid)).map(o => o.id);
    return prisma.transaction.findMany({ where: { scheduledOccurrenceId: { in: ids } }, orderBy: { date: 'asc' } });
  };
  const dueIn = (ms: number) => { const d = new Date(Date.now() + ms); d.setSeconds(0, 0); return d; };
  const base = (over: Record<string, unknown> = {}) => ({ type: 'EXPENSE' as const, category: 'rent' as const, title: 'Rent', amount: 5000, startAt: dueIn(2 * DAY).toISOString(), ...over });

  try {
    const A = await newClient();
    const wA = await wallet(A);

    // ── 1. Validation ─────────────────────────────────────────────────────────
    await rejects('past first date refused', () => scheduled.create(A, base({ startAt: dueIn(-DAY).toISOString() })), 'in the future');
    await rejects('income or expense only', () => scheduled.create(A, base({ type: 'TRANSFER' as any })), 'income or expense');
    await rejects('zero amount refused', () => scheduled.create(A, base({ amount: 0 })), 'greater than zero');
    await rejects('empty title refused', () => scheduled.create(A, base({ title: '  ' })), 'title');
    await rejects('unknown category refused', () => scheduled.create(A, base({ category: 'nope' as any })), 'category');
    await rejects('bad repeat rule refused', () => scheduled.create(A, base({ repeat: { ...blankRule('WEEK'), every: 0 } })), 'between 1 and 99');
    await rejects('unknown time zone refused', () => scheduled.create(A, base({ timezone: 'Mars/Base' })), 'time zone');
    await rejects('bad date refused', () => scheduled.create(A, base({ startAt: 'soon' })), 'valid');
    const B = await newClient();
    const wB = await wallet(B);
    await rejects('someone else\'s wallet refused', () => scheduled.create(A, base({ walletId: wB.id })), 'not found');
    const wOld = await wallet(A, 1000, { archived: true });
    await rejects('archived wallet refused', () => scheduled.create(A, base({ walletId: wOld.id })), 'archived');

    // ── 2. A one-time scheduled expense ───────────────────────────────────────
    const start1 = dueIn(2 * DAY);
    let s1 = await scheduled.create(A, base({ startAt: start1.toISOString(), walletId: wA.id }));
    check('one-time: one waiting date at the start', [s1.waiting.length, new Date(s1.waiting[0].dueAt).getTime()], [1, start1.getTime()]);
    check('one-time: next due is that date, status active', [new Date(s1.nextDueAt!).getTime(), s1.status], [start1.getTime(), 'ACTIVE']);
    check('one-time: the time zone defaults to the person\'s', s1.timezone, TZ);
    check('one-time: nothing has moved yet', [await bal(wA.id), (await posted(s1.id)).length], [100000, 0]);
    const r1 = (await prisma.reminder.findMany({ where: { occurrenceId: s1.waiting[0].id } }))[0];
    check('one-time: a reminder is set, first rung "1 day before"', [r1.kind, r1.status, r1.nextFireAt!.getTime()], ['SCHEDULED_TX', 'ACTIVE', start1.getTime() - DAY]);

    // ── 3. Confirm: one transaction, wallet moves, schedule ends ──────────────
    const c1 = await scheduled.confirm(A, s1.waiting[0].id);
    const t1 = await posted(s1.id);
    check('confirm: wallet −5,000 and one transaction', [await bal(wA.id), t1.length], [95000, 1]);
    check('confirm: the transaction is an expense in the right category', [t1[0].type, t1[0].category, Number(t1[0].amount), t1[0].title], ['EXPENSE', 'bills', 5000, 'Rent']);
    check('confirm: occurrence POSTED and linked', [(await occs(s1.id))[0].status, (await occs(s1.id))[0].transactionId === c1.transactionId], ['POSTED', true]);
    check('confirm: a one-time schedule ends itself', (await prisma.scheduledTransaction.findUniqueOrThrow({ where: { id: s1.id } })).status, 'ENDED');
    check('confirm: its reminder is completed', (await prisma.reminder.findMany({ where: { occurrenceId: s1.waiting[0].id } }))[0].status, 'DONE');
    await rejects('confirming the same date again is refused', () => scheduled.confirm(A, s1.waiting[0].id), 'already handled');
    check('…and nothing was posted twice', [await bal(wA.id), (await posted(s1.id)).length], [95000, 1]);

    // ── 4. Two confirms at the same moment: exactly one transaction ───────────
    let s2 = await scheduled.create(A, base({ walletId: wA.id, title: 'Race', repeat: rule({ unit: 'WEEK', weekdays: [2, 5] }) }));
    const wid = s2.waiting[0].id;
    const results = await Promise.allSettled([scheduled.confirm(A, wid), scheduled.confirm(A, wid)]);
    check('double confirm: one wins, one is refused', results.map(r => r.status).sort(), ['fulfilled', 'rejected']);
    check('double confirm: one transaction, wallet moved once', [(await posted(s2.id)).length, await bal(wA.id)], [1, 90000]);

    // ── 5. Recurring: the next date lines up, history stays ───────────────────
    s2 = await scheduled.findOne(A, s2.id);
    check('recurring: after posting, exactly one future date is waiting', [s2.waiting.length, s2.status], [1, 'ACTIVE']);
    check('recurring: the next date is after the one just posted', new Date(s2.waiting[0].dueAt).getTime() > (await occs(s2.id))[0].dueAt.getTime(), true);
    check('recurring: history shows the posted date', s2.history.map((h: any) => h.status), ['POSTED']);
    check('recurring: the new date has its own reminder, the old one is done',
      (await prisma.reminder.findMany({ where: { occurrence: { scheduleId: s2.id } }, orderBy: { createdAt: 'asc' } })).map(r => r.status), ['DONE', 'ACTIVE']);
    await scheduled.materialize(s2.id); await scheduled.materialize(s2.id);
    check('lining up twice does not create extra dates', (await pending(s2.id)).length, 1);

    // ── 6. Confirm with a different amount and wallet (this date only) ────────
    const wA2 = await wallet(A, 50000);
    const c6 = await scheduled.confirm(A, (await pending(s2.id))[0].id, { amount: 1234.5, walletId: wA2.id });
    const t6 = await prisma.transaction.findUniqueOrThrow({ where: { id: c6.transactionId } });
    check('override: this date used the new amount and wallet', [Number(t6.amount), t6.walletId, await bal(wA2.id)], [1234.5, wA2.id, 50000 - 1234.5]);
    check('override: the schedule itself is unchanged', Number((await prisma.scheduledTransaction.findUniqueOrThrow({ where: { id: s2.id } })).amount), 5000);

    // ── 7. Skip ───────────────────────────────────────────────────────────────
    const before7 = await bal(wA.id);
    const w7 = (await pending(s2.id))[0];
    await scheduled.skip(A, w7.id);
    check('skip: no transaction, status SKIPPED, wallet untouched', [(await prisma.scheduledOccurrence.findUniqueOrThrow({ where: { id: w7.id } })).status, await bal(wA.id)], ['SKIPPED', before7]);
    check('skip: the next date is lined up and its reminder cancelled for the skipped one',
      [(await pending(s2.id)).length, (await prisma.reminder.findFirst({ where: { occurrenceId: w7.id } }))!.status], [1, 'CANCELLED']);

    // ── 8. Post automatically ─────────────────────────────────────────────────
    const A8 = await newClient();
    const w8 = await wallet(A8);
    const start8 = dueIn(1 * HOUR);
    const s8 = await scheduled.create(A8, base({ startAt: start8.toISOString(), walletId: w8.id, mode: 'AUTO_POST', title: 'Netflix', repeat: rule({ unit: 'MONTH' }) }));
    check('auto: no reminder is created', await prisma.reminder.count({ where: { occurrence: { scheduleId: s8.id } } }), 0);
    check('auto: nothing posts before it is due', [(await scheduled.processDue(at(start8.getTime() - MIN))).posted, await bal(w8.id)], [0, 100000]);
    const stats = await scheduled.processDue(at(start8.getTime() + MIN));
    check('auto: posts at the due time', [stats.posted, await bal(w8.id), (await posted(s8.id))[0].date.getTime()], [1, 95000, start8.getTime()]);
    check('auto: the next month is lined up', (await pending(s8.id)).length, 1);
    check('auto: running the same minute again posts nothing more', [(await scheduled.processDue(at(start8.getTime() + MIN))).posted, (await posted(s8.id)).length], [0, 1]);

    // ── 9. Catching up after downtime ─────────────────────────────────────────
    const A9 = await newClient();
    const w9 = await wallet(A9);
    const start9 = dueIn(1 * DAY);
    const s9 = await scheduled.create(A9, base({ startAt: start9.toISOString(), walletId: w9.id, mode: 'AUTO_POST', amount: 100, repeat: rule({ unit: 'DAY' }) }));
    await scheduled.processDue(at(start9.getTime() + 5 * DAY + MIN));
    const p9 = await posted(s9.id);
    check('catch-up (auto): six missed days posted with their original dates', p9.map(t => t.date.getTime()), [0, 1, 2, 3, 4, 5].map(k => start9.getTime() + k * DAY));
    check('catch-up (auto): wallet moved six times, one future date waiting', [await bal(w9.id), (await pending(s9.id)).length], [100000 - 600, 1]);

    const A9b = await newClient();
    const start9b = dueIn(1 * DAY);
    const s9b = await scheduled.create(A9b, base({ startAt: start9b.toISOString(), amount: 100, repeat: rule({ unit: 'DAY' }) }));
    await scheduled.processDue(at(start9b.getTime() + 5 * DAY + MIN));
    check('catch-up (remind): six missed dates wait, plus one in the future', (await pending(s9b.id)).length, 7);
    check('catch-up (remind): each has a reminder', await prisma.reminder.count({ where: { occurrence: { scheduleId: s9b.id }, status: 'ACTIVE' } }), 7);

    // ── 10. A very long outage is capped ──────────────────────────────────────
    const A10 = await newClient();
    const start10 = dueIn(1 * DAY);
    const s10 = await scheduled.create(A10, base({ startAt: start10.toISOString(), amount: 1, mode: 'AUTO_POST', repeat: rule({ unit: 'DAY' }) }));
    const longAfter = at(start10.getTime() + 45 * DAY);
    await scheduled.processDue(longAfter);
    check('long outage: at most the cap is caught up', (await posted(s10.id)).length, CATCH_UP_CAP);
    check('long outage: the schedule carries on with a future date', (await pending(s10.id)).every(o => o.dueAt.getTime() > longAfter.getTime()), true);

    // ── 11. Pause and resume ──────────────────────────────────────────────────
    const A11 = await newClient();
    const s11 = await scheduled.create(A11, base({ repeat: rule({ unit: 'WEEK' }) }));
    const paused = await scheduled.pause(A11, s11.id);
    check('pause: status, nothing waiting, no reminder left', [paused.status, paused.waiting.length, await prisma.reminder.count({ where: { occurrence: { scheduleId: s11.id } } })], ['PAUSED', 0, 0]);
    check('pause: nothing is lined up while paused', [(await scheduled.processDue(at(Date.now() + 30 * DAY))).lined, (await pending(s11.id)).length], [0, 0]);
    const resumed = await scheduled.resume(A11, s11.id);
    check('resume: active again with one future date (no backfill)', [resumed.status, resumed.waiting.length, resumed.waiting.every((w: any) => !w.overdue)], ['ACTIVE', 1, true]);
    await rejects('resume: only a paused schedule can resume', () => scheduled.resume(A11, s11.id), 'paused');
    await rejects('pause: only an active schedule can pause', async () => { await scheduled.pause(A11, s11.id); await scheduled.pause(A11, s11.id); }, 'active');

    // ── 12. Editing ───────────────────────────────────────────────────────────
    const A12 = await newClient();
    const w12 = await wallet(A12);
    let s12 = await scheduled.create(A12, base({ walletId: w12.id, repeat: rule({ unit: 'WEEK', weekdays: [1] }) }));
    const keep = (await pending(s12.id))[0];
    s12 = await scheduled.update(A12, s12.id, { amount: 7777, title: 'Rent v2' });
    check('edit amount/title only: the waiting date and its reminder are kept', [(await pending(s12.id))[0].id === keep.id, s12.amount, s12.title], [true, 7777, 'Rent v2']);
    const tPost = await scheduled.confirm(A12, keep.id);
    check('edit: the next confirm uses the new amount', Number((await prisma.transaction.findUniqueOrThrow({ where: { id: tPost.transactionId } })).amount), 7777);
    const postedBefore = (await posted(s12.id)).length;
    s12 = await scheduled.update(A12, s12.id, { repeat: rule({ unit: 'MONTH', monthDays: [15] }) });
    check('edit timing: posted history stays, waiting dates are replaced', [(await posted(s12.id)).length, (await pending(s12.id)).length], [postedBefore, 1]);
    const dupes = (await occs(s12.id)).map(o => o.dueAt.getTime());
    check('edit timing: no date appears twice', new Set(dupes).size, dupes.length);
    s12 = await scheduled.update(A12, s12.id, { mode: 'AUTO_POST' });
    check('switching to auto cancels the reminders', await prisma.reminder.count({ where: { occurrence: { scheduleId: s12.id }, status: 'ACTIVE' } }), 0);
    s12 = await scheduled.update(A12, s12.id, { mode: 'REMIND_CONFIRM' });
    check('switching back to remind brings them back', await prisma.reminder.count({ where: { occurrence: { scheduleId: s12.id }, status: 'ACTIVE' } }), 1);
    await rejects('edit: a past first date is refused', () => scheduled.update(A12, s12.id, { startAt: dueIn(-DAY).toISOString() }), 'in the future');
    await rejects('edit: a bad rule is refused', () => scheduled.update(A12, s12.id, { repeat: { ...blankRule('MONTH'), monthDays: [40] } }), 'Days of the month');

    // ── 13. Ending ────────────────────────────────────────────────────────────
    const ended = await scheduled.end(A12, s12.id);
    check('end: status ENDED, nothing waiting, history and transactions stay', [ended.status, ended.waiting.length, (await posted(s12.id)).length], ['ENDED', 0, postedBefore]);
    await rejects('ended: cannot be edited', () => scheduled.update(A12, s12.id, { amount: 1 }), 'ended');
    check('ended: leaves the default list', (await scheduled.list(A12)).some(s => s.id === s12.id), false);
    check('ended: shows when asked for', (await scheduled.list(A12, 'ENDED')).some(s => s.id === s12.id), true);

    // ── 14. "After 2 times" ends on its own ───────────────────────────────────
    const A14 = await newClient();
    const s14 = await scheduled.create(A14, base({ repeat: rule({ unit: 'WEEK', ends: { type: 'after', count: 2 } }) }));
    await scheduled.confirm(A14, (await pending(s14.id))[0].id);
    check('after 2: still active after the first', (await scheduled.findOne(A14, s14.id)).status, 'ACTIVE');
    await scheduled.confirm(A14, (await pending(s14.id))[0].id);
    const after2 = await scheduled.findOne(A14, s14.id);
    check('after 2: ended by itself after the second, nothing waiting', [after2.status, after2.waiting.length, (await posted(s14.id)).length], ['ENDED', 0, 2]);

    // ── 15. A failure is recorded, reported, never silent ─────────────────────
    const A15 = await newClient();
    const w15 = await wallet(A15);
    const start15 = dueIn(1 * HOUR);
    const s15 = await scheduled.create(A15, base({ startAt: start15.toISOString(), walletId: w15.id, mode: 'AUTO_POST', repeat: rule({ unit: 'DAY' }) }));
    await prisma.wallet.update({ where: { id: w15.id }, data: { archived: true } });
    const notifiedBefore = notified.length;
    const st15 = await scheduled.processDue(at(start15.getTime() + MIN));
    const first15 = (await occs(s15.id))[0];
    check('failure: occurrence FAILED with a readable reason', [st15.failed, first15.status, first15.failReason], [1, 'FAILED', 'The wallet is archived']);
    check('failure: no transaction, wallet untouched', [(await posted(s15.id)).length, await bal(w15.id)], [0, 100000]);
    check('failure: the person is told', notified.length - notifiedBefore, 1);
    check('failure: the next date is still lined up', (await pending(s15.id)).length, 1);
    await rejects('failure: retrying while the wallet is still archived stays failed', () => scheduled.confirm(A15, first15.id), 'archived');
    await prisma.wallet.update({ where: { id: w15.id }, data: { archived: false } });
    const retry = await scheduled.confirm(A15, first15.id);
    check('failure: after fixing the wallet, a retry posts it', [retry.status, await bal(w15.id)], ['POSTED', 95000]);
    check('failure: a failed date is not retried by itself', (await scheduled.processDue(at(start15.getTime() + 2 * MIN))).posted, 0);

    // ── 16. Other people cannot touch it ──────────────────────────────────────
    const sec = await scheduled.create(A, base({ title: 'Mine' }));
    const w16 = sec.waiting[0].id;
    await rejects('security: cannot read', () => scheduled.findOne(B, sec.id), 'not found');
    await rejects('security: cannot edit', () => scheduled.update(B, sec.id, { amount: 1 }), 'not found');
    await rejects('security: cannot pause', () => scheduled.pause(B, sec.id), 'not found');
    await rejects('security: cannot end', () => scheduled.end(B, sec.id), 'not found');
    await rejects('security: cannot confirm', () => scheduled.confirm(B, w16), 'not found');
    await rejects('security: cannot skip', () => scheduled.skip(B, w16), 'not found');
    check('security: it does not appear in their list or waiting list', [(await scheduled.list(B)).length, (await scheduled.waiting(B)).length], [0, 0]);

    // ── 17. Reminders: wording, data, pending list, completion ───────────────
    const A17 = await newClient();
    const w17 = await wallet(A17);
    const start17 = dueIn(3 * DAY);
    const ladder17 = buildLadder(start17, TZ);
    const s17 = await scheduled.create(A17, base({ startAt: start17.toISOString(), walletId: w17.id, title: 'Electricity' }));
    const sI = await scheduled.create(A17, base({ startAt: start17.toISOString(), type: 'INCOME', category: 'salary', title: 'Salary', amount: 200000, walletId: w17.id }));
    await reminders.tick(at(ladder17[0].at.getTime() + MIN));
    const sent17 = push.sent.filter(p => p.clientId === A17).map(p => p.payload);
    check('reminder: scheduled expense wording', sent17.map(p => p.title).sort(), ['Expected income tomorrow', 'Scheduled payment due tomorrow']);
    // two reminders for one person is under the digest threshold of three
    const pay = sent17.find(p => p.title.startsWith('Scheduled'))!;
    check('reminder: push carries the occurrence and schedule ids', [!!(pay.data as any).occurrenceId, (pay.data as any).scheduleId === s17.id], [true, true]);
    check('reminder: wording names the title and amount', [pay.body.includes('Electricity'), pay.body.includes('5,000')], [true, true]);
    const mail = email.sent.filter(e => e.data.person === 'Electricity');
    check('reminder: email says what it is', [mail.length >= 1, mail[0]?.data.whoLine], [true, 'Scheduled payment · Electricity']);
    const pend = (await reminders.pending(A17, at(ladder17[0].at.getTime() + 2 * MIN))) as any[];
    const exp = pend.find(p => p.title === 'Electricity');
    check('pending list: the scheduled item with everything the popup needs', [pend.length, exp.source, exp.txType, exp.remaining, exp.currency, exp.occurrenceId === s17.waiting[0].id], [2, 'SCHEDULED', 'EXPENSE', 5000, 'RWF', true]);
    check('pending list: income item is typed as income', pend.find(p => p.title === 'Salary').txType, 'INCOME');
    await scheduled.confirm(A17, s17.waiting[0].id);
    check('confirming completes its reminder and removes it from the list', [(await reminders.pending(A17, at(ladder17[0].at.getTime() + 3 * MIN))).length], [1]);
    const incomeOcc = sI.waiting[0].id;
    await scheduled.confirm(A17, incomeOcc);
    check('income raises the wallet', await bal(w17.id), 100000 - 5000 + 200000);
    const snoozeTarget = (await reminders.pending(A17, at(ladder17[0].at.getTime() + 4 * MIN)));
    check('pending list is empty once both are handled', snoozeTarget.length, 0);

    const F = await newClient({ language: 'fr' });
    const wF = await wallet(F);
    const startF = dueIn(3 * DAY);
    await scheduled.create(F, base({ startAt: startF.toISOString(), walletId: wF.id, title: 'Loyer' }));
    await reminders.tick(at(buildLadder(startF, TZ)[0].at.getTime() + MIN));
    check('reminder: French wording', push.sent.filter(p => p.clientId === F)[0].payload.title, 'Paiement prévu demain');

    // ── 18. A snoozed scheduled reminder wakes up ─────────────────────────────
    const A18 = await newClient();
    const start18 = dueIn(3 * DAY);
    const l18 = buildLadder(start18, TZ);
    const s18 = await scheduled.create(A18, base({ startAt: start18.toISOString() }));
    await reminders.tick(at(l18[0].at.getTime() + MIN));
    const rem18 = (await prisma.reminder.findMany({ where: { occurrence: { scheduleId: s18.id } } }))[0];
    await reminders.snooze(A18, rem18.id, { minutes: 60 }, at(l18[0].at.getTime() + 2 * MIN));
    check('snooze works on a scheduled reminder', (await prisma.reminder.findUniqueOrThrow({ where: { id: rem18.id } })).status, 'SNOOZED');
    await reminders.dismiss(A18, rem18.id);
    check('dismissing does not post anything', [(await posted(s18.id)).length, (await pending(s18.id)).length], [0, 1]);

    // ── 19. Time zones: the same wall-clock time every time ───────────────────
    const A19 = await newClient({ timezone: 'America/New_York' });
    const startNY = zonedToUtc({ y: 2035, m: 3, d: 10, h: 9, mi: 0 }, 'America/New_York');      // 9:00 the day before US clocks change
    const s19 = await scheduled.create(A19, { ...base({ startAt: startNY.toISOString(), amount: 1, mode: 'AUTO_POST', repeat: rule({ unit: 'DAY' }) }) });
    check('zone: the rule is stored in the person\'s zone', s19.timezone, 'America/New_York');
    await scheduled.processDue(at(startNY.getTime() + 3 * DAY));
    const utcHours = (await occs(s19.id)).slice(0, 3).map(o => o.dueAt.toISOString().slice(0, 16));
    check('zone: 9:00 stays 9:00 across the daylight-saving change (UTC shifts by an hour)', utcHours, ['2035-03-10T14:00', '2035-03-11T13:00', '2035-03-12T13:00']);

    const startKGL = zonedToUtc({ y: 2035, m: 6, d: 5, h: 9, mi: 0 }, TZ);                    // a Tuesday
    const sK = await scheduled.create(A, { ...base({ startAt: startKGL.toISOString(), repeat: rule({ unit: 'WEEK', weekdays: [2, 5] }) }) });
    await scheduled.processDue(at(startKGL.getTime() + 8 * DAY));
    check('zone: Tuesday and Friday at 9:00 in Kigali are 07:00 UTC', (await occs(sK.id)).slice(0, 4).map(o => o.dueAt.toISOString().slice(0, 16)),
      ['2035-06-05T07:00', '2035-06-08T07:00', '2035-06-12T07:00', '2035-06-15T07:00']);

    // ── 20. Lists ─────────────────────────────────────────────────────────────
    const list = await scheduled.list(A);
    check('list: active schedules with their waiting dates, no ended ones', [list.every(s => s.status !== 'ENDED'), list.every(s => Array.isArray(s.waiting))], [true, true]);
    const walleted = await scheduled.create(A, base({ walletId: wA.id, title: 'Has wallet' }));
    check('currency: the list and detail carry the wallet currency', [(await scheduled.list(A)).find(x => x.id === walleted.id)!.currency, walleted.currency, (await scheduled.findOne(A, sK.id)).currency], ['RWF', 'RWF', '']);
    const detail = await scheduled.findOne(A, sK.id);
    check('detail: next five upcoming dates are listed', [detail.upcoming.length, detail.upcoming.every((d: Date, i: number, a: Date[]) => i === 0 || a[i - 1] < d)], [5, true]);
    const dueList = await scheduled.waiting(A17);
    check('waiting list is empty when everything is handled', dueList.length, 0);
    const dueNow = await scheduled.waiting(A9b);
    check('waiting list shows only what is due within a day', [dueNow.length, dueNow.every(d => d.dueAt.getTime() <= Date.now() + DAY + 1000)], [1, true]);
  } finally {
    await prisma.client.deleteMany({ where: { id: { in: made } } });
    await prisma.$disconnect();
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
