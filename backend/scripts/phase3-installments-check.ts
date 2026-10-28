/**
 * Phase 3 end-to-end check for pay dates (installments). Runs the REAL DebtsService against
 * whatever DATABASE_URL points to, so ONLY run it on a scratch copy:
 *
 *   DATABASE_URL="mysql://root@localhost:3306/expense_p3_test" npx ts-node scripts/phase3-installments-check.ts
 *
 * It creates its own client + wallet and removes everything it created at the end.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { DebtsService } from '../src/modules/debts/debts.service';
import { DebtPlanService } from '../src/modules/debts/debt-plan.service';
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

const DAY = 864e5;
const iso = (offsetDays: number, hour = 18) => {
  const d = new Date(Date.now() + offsetDays * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

async function main() {
  if (!/p1test|scratch|_test/i.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('Refusing to run: DATABASE_URL must point at a scratch database (name containing p1test / scratch / _test).');
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  const notifications = new NotificationsService(prisma);
  notifications.notify = () => undefined;
  const debts = new DebtsService(prisma, notifications, makeReminders(prisma).reminders, new DebtPlanService(prisma));

  const stamp = Date.now();
  const client = await prisma.client.create({
    data: { firstName: 'Check', email: `p3check${stamp}@example.com`, phone: `+000${stamp}`, isVerified: true },
  });
  const cid = client.id;
  const views = (d: any) => d.installments.map((i: any) => i.view);

  try {
    const w = await prisma.wallet.create({ data: { clientId: cid, name: 'Main', bank: 'Test', currency: 'RWF', balance: 100000 } });

    // ── Create with a first pay date ──────────────────────────────────────────
    let d = await debts.create(cid, { kind: 'BORROWED', person: 'John', amount: 200000, currency: 'RWF', dueDate: iso(-5) });
    check('create: one pay date was seeded from the due date', d.installments.length, 1);
    check('create: it is overdue (5 days ago, nothing paid)', views(d), ['OVERDUE']);
    check('create: debt is overdue', d.overdue, true);
    check('create: that single date asks for the whole debt', d.installments[0].plannedAmount, 200000);

    // ── Add more pay dates ────────────────────────────────────────────────────
    d = await debts.addInstallment(cid, d.id, { dueAt: iso(2), plannedAmount: 100000 });
    check('add: two pay dates, history kept', d.installments.length, 2);
    check('add: the open-ended first date shrank to the part not planned elsewhere', d.installments[0].plannedAmount, 100000);
    check('add: debt.dueDate follows the last active date', new Date(d.dueDate).getTime(), new Date(iso(2)).getTime());
    await rejects('add: more than is left is refused', () => debts.addInstallment(cid, d.id, { dueAt: iso(3), plannedAmount: 999999 }), 'left to pay');
    await rejects('add: bad date is refused', () => debts.addInstallment(cid, d.id, { dueAt: 'not a date' }), 'valid pay date');

    // ── Pay: oldest date fills first ──────────────────────────────────────────
    d = await debts.addPayment(cid, d.id, { amount: 100000, walletId: w.id });
    check('pay 100,000: oldest date is paid, next is upcoming', views(d), ['PAID', 'UPCOMING']);
    check('pay: debt no longer overdue', d.overdue, false);
    check('pay: next due is the second date', new Date(d.nextDueAt).getTime(), new Date(iso(2)).getTime());
    await rejects('move: a paid date cannot be moved', () => debts.moveInstallment(cid, d.id, d.installments[0].id, { dueAt: iso(9) }), 'already paid');

    // ── Move keeps history ────────────────────────────────────────────────────
    const second = d.installments[1];
    d = await debts.moveInstallment(cid, d.id, second.id, { dueAt: iso(10) });
    check('move: 3 rows now (old one kept)', d.installments.length, 3);
    check('move: old row is MOVED, new one upcoming', d.installments.map((i: any) => i.view).sort(), ['MOVED', 'PAID', 'UPCOMING']);
    const fresh = d.installments.find((i: any) => i.movedFromId === second.id);
    check('move: new row points back at the old one and keeps the amount', [fresh.movedFromId, fresh.plannedAmount], [second.id, 100000]);
    check('move: debt.dueDate follows the moved date', new Date(d.dueDate).getTime(), new Date(iso(10)).getTime());
    await rejects('move: an already moved date cannot be moved again', () => debts.moveInstallment(cid, d.id, second.id, { dueAt: iso(11) }), 'already moved');

    // ── Undo a payment: everything recalculates ───────────────────────────────
    const pay = d.payments[0];
    d = await debts.removePayment(cid, d.id, pay.id);
    check('undo payment: nothing is paid again, first date is overdue', views(d).filter((v: string) => v !== 'MOVED'), ['OVERDUE', 'UPCOMING']);
    d = await debts.addPayment(cid, d.id, { amount: 100000, walletId: w.id });

    // ── Skip ──────────────────────────────────────────────────────────────────
    const upcoming = d.installments.find((i: any) => i.view === 'UPCOMING');
    d = await debts.skipInstallment(cid, d.id, upcoming.id);
    check('skip: the date is SKIPPED, not deleted', d.installments.find((i: any) => i.id === upcoming.id).view, 'SKIPPED');
    // The only active date left is the open-ended first one: it now asks for "the rest" and is long past due.
    const survivor = d.installments.find((i: any) => i.view !== 'SKIPPED' && i.view !== 'MOVED');
    check('skip: the remaining open-ended date takes over the unpaid rest', [survivor.view, survivor.plannedAmount], ['OVERDUE', 200000]);
    check('skip: it becomes the next due date', new Date(d.nextDueAt).getTime(), new Date(survivor.dueAt).getTime());

    // ── Forgive the rest closes unmet dates ───────────────────────────────────
    let e = await debts.create(cid, { kind: 'LENT', person: 'Eric', amount: 120000, walletId: w.id, dueDate: iso(3) });
    e = await debts.addInstallment(cid, e.id, { dueAt: iso(20), plannedAmount: 60000 });
    e = await debts.addPayment(cid, e.id, { amount: 40000, walletId: w.id });
    e = await debts.writeOff(cid, e.id);
    check('write-off: status WRITTEN_OFF, remaining 0', [e.status, e.remaining], ['WRITTEN_OFF', 0]);
    check('write-off: unmet dates were skipped, none left active', e.installments.every((i: any) => i.view === 'SKIPPED' || i.view === 'PAID'), true);
    check('write-off: no reminders drive it any more', e.nextDueAt, null);
    await rejects('write-off: closed debt refuses new pay dates', () => debts.addInstallment(cid, e.id, { dueAt: iso(30) }), 'already closed');

    // ── Archive blocks edits; restore allows them ─────────────────────────────
    let f = await debts.create(cid, { kind: 'BORROWED', person: 'Aline', amount: 50000, dueDate: iso(4), currency: 'RWF' });
    f = await debts.archive(cid, f.id);
    await rejects('archive: pay dates are locked', () => debts.addInstallment(cid, f.id, { dueAt: iso(8) }), 'Restore this loan');
    check('archive: an archived debt is never "overdue"', f.overdue, false);
    f = await debts.restore(cid, f.id);
    f = await debts.addInstallment(cid, f.id, { dueAt: iso(8) });
    check('restore: pay dates work again', f.installments.length, 2);

    // ── Legacy path: update with a due date seeds one only when none exist ─────
    const g0 = await debts.create(cid, { kind: 'BORROWED', person: 'Marie', amount: 1000, currency: 'RWF' });
    check('legacy: debt without a date has no pay dates', g0.installments.length, 0);
    let g = await debts.update(cid, g0.id, { dueDate: iso(6) });
    check('legacy: update seeds the first pay date', g.installments.length, 1);
    g = await debts.update(cid, g0.id, { dueDate: iso(50) });
    check('legacy: a second due-date update does not replace history', g.installments.length, 1);

    // ── Summary counts an overdue EARLY pay date even though the final deadline is still ahead ──
    const before = (await debts.summary(cid)).overdue;
    const h = await debts.create(cid, { kind: 'BORROWED', person: 'Late', amount: 1000, currency: 'RWF', dueDate: iso(-2) });
    await debts.addInstallment(cid, h.id, { dueAt: iso(30) });
    check('summary: early pay date overdue counts, final deadline ahead', (await debts.summary(cid)).overdue, before + 1);

    // ── Cascade ───────────────────────────────────────────────────────────────
    await debts.remove(cid, f.id);
    check('delete: pay dates go with the debt', await prisma.debtInstallment.count({ where: { debtId: f.id } }), 0);

    // ── Another user cannot touch it ──────────────────────────────────────────
    await rejects('security: other client cannot add a pay date', () => debts.addInstallment('someone-else', g0.id, { dueAt: iso(2) }), 'not found');
  } finally {
    const ids = (await prisma.debt.findMany({ where: { clientId: cid }, select: { id: true } })).map(x => x.id);
    await prisma.debtInstallment.deleteMany({ where: { debtId: { in: ids } } });
    await prisma.debtPayment.deleteMany({ where: { debtId: { in: ids } } });
    await prisma.transaction.deleteMany({ where: { clientId: cid } });
    await prisma.debt.deleteMany({ where: { clientId: cid } });
    await prisma.wallet.deleteMany({ where: { clientId: cid } });
    await prisma.client.delete({ where: { id: cid } });
    await prisma.$disconnect();
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
