/**
 * Phase 7 end-to-end check of the Home summary and the feed filters. Runs the REAL services against
 * whatever DATABASE_URL points to (fake push + email), so ONLY run it on a scratch copy:
 *
 *   DATABASE_URL="mysql://root@localhost:3306/expense_p3_test" npx ts-node scripts/phase7-home-check.ts
 */
import { personalScope } from '../src/modules/family/scope/scope';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { TransactionService } from '../src/modules/transaction/transaction.service';
import { DebtsService } from '../src/modules/debts/debts.service';
import { DebtPlanService } from '../src/modules/debts/debt-plan.service';
import { ScheduledService } from '../src/modules/scheduled/scheduled.service';
import { HomeService } from '../src/modules/home/home.service';
import { blankRule } from '../src/modules/scheduled/recurrence';
import { makeReminders } from './_fakes';

let failures = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`}`);
};

const DAY = 864e5;
const iso = (offsetDays: number, hour = 18) => { const d = new Date(Date.now() + offsetDays * DAY); d.setHours(hour, 0, 0, 0); return d.toISOString(); };

async function main() {
  if (!/p1test|scratch|_test/i.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('Refusing to run: DATABASE_URL must point at a scratch database (name containing p1test / scratch / _test).');
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  const notifications = new NotificationsService(prisma);
  notifications.notify = () => undefined;
  const { reminders } = makeReminders(prisma);
  const transactions = new TransactionService(prisma, notifications);
  const debts = new DebtsService(prisma, notifications, reminders, new DebtPlanService(prisma));
  const scheduled = new ScheduledService(prisma, transactions, notifications, reminders);
  const home = new HomeService(prisma, debts, scheduled);

  await prisma.reminder.deleteMany({});
  const stamp = Date.now();
  const made: string[] = [];
  const mk = async (n: string) => {
    const c = await prisma.client.create({ data: { firstName: n, email: `p7${stamp}${n}@example.com`, phone: `+000${stamp}${n}`, isVerified: true } });
    made.push(c.id);
    await prisma.notificationPreference.create({ data: { clientId: c.id, timezone: 'Africa/Kigali' } });
    return c.id;
  };
  const now = new Date();
  const month = now.getMonth() + 1, year = now.getFullYear();

  try {
    const A = await mk('A');
    const wRwf = await prisma.wallet.create({ data: { clientId: A, name: 'Main', bank: 'T', currency: 'RWF', balance: 1_000_000 } });
    const wUsd = await prisma.wallet.create({ data: { clientId: A, name: 'Dollar', bank: 'T', currency: 'USD', balance: 0, archived: true } });

    // ── An empty person sees zeros, not errors ────────────────────────────────
    const empty = await home.summary(personalScope(await mk('E')), month, year);
    check('empty: zero totals, nothing owed, nothing waiting', [empty.totals, empty.loans, empty.owe, empty.owed, empty.attentionTotal, empty.scheduled.waiting, empty.netWorth],
      [{ income: 0, expense: 0, net: 0 }, { out: 0, in: 0, borrowed: 0 }, {}, {}, 0, 0, []]);

    // ── A realistic month ─────────────────────────────────────────────────────
    await transactions.create(personalScope(A), { type: 'INCOME', category: 'salary', title: 'Salary', amount: 500000, walletId: wRwf.id });
    await transactions.create(personalScope(A), { type: 'EXPENSE', category: 'food', title: 'Groceries', amount: 180000, walletId: wRwf.id });
    const john = await debts.create(A, { kind: 'BORROWED', person: 'John', amount: 200000, currency: 'RWF', dueDate: iso(-3) });   // overdue
    await debts.addPayment(A, john.id, { amount: 50000, walletId: wRwf.id });
    const eric = await debts.create(A, { kind: 'LENT', person: 'Eric', amount: 120000, walletId: wRwf.id, dueDate: iso(1, 9) });
    await debts.addPayment(A, eric.id, { amount: 40000, walletId: wRwf.id });
    await debts.create(A, { kind: 'BORROWED', person: 'Dollar Dan', amount: 50, currency: 'USD', dueDate: iso(20) });

    const on = await home.summary(personalScope(A), month, year, true);
    check('loans on: income = salary + repayment received (borrowed money is not income)', on.totals.income, 540000);
    check('loans on: expense = groceries + repayment made + money lent', on.totals.expense, 350000);
    check('loans on: net', on.totals.net, 190000);
    check('loans line: out, in, borrowed', on.loans, { out: 170000, in: 40000, borrowed: 200050 });
    const off = await home.summary(personalScope(A), month, year, false);
    check('loans off: only everyday money', [off.totals.income, off.totals.expense, off.totals.net], [500000, 180000, 320000]);
    check('loans off: the loans line still tells the truth', off.loans, { out: 170000, in: 40000, borrowed: 200050 });
    check('the switch is echoed back', [on.includeLoans, off.includeLoans], [true, false]);

    // ── Debt and credit cards ─────────────────────────────────────────────────
    check('you owe: RWF 150,000, 1 open, 1 overdue', [on.owe.RWF.amount, on.owe.RWF.count, on.owe.RWF.overdue], [150000, 1, 1]);
    check('you owe: another currency stays separate', [on.owe.USD.amount, on.owe.USD.count, on.owe.USD.overdue], [50, 1, 0]);
    check('owed to you: 80,000, 1 open, not overdue', [on.owed.RWF.amount, on.owed.RWF.count, on.owed.RWF.overdue], [80000, 1, 0]);
    check('the soonest pay date is reported per currency', [!!on.owe.RWF.nextDueAt, !!on.owed.RWF.nextDueAt, !!on.owe.USD.nextDueAt], [true, true, true]);

    // ── Net worth never mixes currencies ──────────────────────────────────────
    const walletNow = Number((await prisma.wallet.findUniqueOrThrow({ where: { id: wRwf.id } })).balance);
    const nwRwf = on.netWorth.find(n => n.currency === 'RWF')!;
    check('net worth RWF = wallets + owed to you − you owe', [nwRwf.wallets, nwRwf.owed, nwRwf.owe, nwRwf.total], [walletNow, 80000, 150000, walletNow + 80000 - 150000]);
    const nwUsd = on.netWorth.find(n => n.currency === 'USD')!;
    check('net worth USD: an archived wallet is ignored, the debt still counts', [nwUsd.wallets, nwUsd.owe, nwUsd.total], [0, 50, -50]);
    check('net worth is listed per currency, sorted', on.netWorth.map(n => n.currency), ['RWF', 'USD']);

    // ── Needs attention ───────────────────────────────────────────────────────
    check('attention: the overdue debt comes first, then the credit due tomorrow (the far USD one is left out)',
      on.attention.map(a => (a as any).person), ['John', 'Eric']);
    check('attention: flags and amounts', [(on.attention[0] as any).overdue, (on.attention[0] as any).remaining, (on.attention[1] as any).overdue], [true, 150000, false]);
    check('attention total counts them all', on.attentionTotal, 2);

    // ── Scheduled ─────────────────────────────────────────────────────────────
    const s1 = await scheduled.create(A, { type: 'EXPENSE', category: 'rent', title: 'Rent', amount: 5000, walletId: wRwf.id, startAt: iso(2), repeat: blankRule('MONTH') } as any);
    const afterSched = await home.summary(personalScope(A), month, year);
    check('scheduled: nothing waiting yet, the next one is named', [afterSched.scheduled.waiting, afterSched.scheduled.next?.title], [0, 'Rent']);
    const dueNow = await scheduled.create(A, { type: 'INCOME', category: 'salary', title: 'Bonus', amount: 9000, walletId: wRwf.id, startAt: new Date(Date.now() + 60_000).toISOString() } as any);
    await scheduled.processDue(new Date(Date.now() + 5 * 60_000));
    const waitingNow = await home.summary(personalScope(A), month, year, true, new Date(Date.now() + 5 * 60_000));
    check('scheduled: a date that is due shows as waiting and in Needs attention', [waitingNow.scheduled.waiting, waitingNow.attention.some(a => (a as any).title === 'Bonus')], [1, true]);
    check('attention: overdue items first, the list is ordered by date', waitingNow.attention.map(a => a.overdue), [true, true, false]);
    void s1; void dueNow;

    // ── Other people see none of it ───────────────────────────────────────────
    const B = await mk('B');
    const other = await home.summary(personalScope(B), month, year);
    check('another person: nothing leaks', [other.totals.income, other.owe, other.owed, other.attentionTotal, other.scheduled.waiting], [0, {}, {}, 0, 0]);

    // ── Bad input falls back safely ───────────────────────────────────────────
    const prev = await home.summary(personalScope(A), month === 1 ? 12 : month - 1, month === 1 ? year - 1 : year);
    check('a month with nothing in it still returns the current debts', [prev.totals.income, prev.owe.RWF.amount], [0, 150000]);

    // ── The feed filters ──────────────────────────────────────────────────────
    const ids = async (query: Record<string, any>) => (await transactions.findAll(personalScope(A), { limit: 50, ...query })).data.map((t: any) => t.title).sort();
    const everything = await ids({});
    check('all: everything, loans included', everything.length >= 6, true);
    check('all, loans off: no debt-tagged rows', (await ids({ includeLoans: 'false' })).some((t: string) => /John|Eric|Repaid|Repayment|Lent|Borrowed/.test(t)), false);
    const inc = await ids({ view: 'income' });
    check('income: salary and repayments received, never the borrowed money', [inc.includes('Salary'), inc.includes('Repayment from Eric'), inc.includes('Borrowed from John')], [true, true, false]);
    check('income, loans off: salary only (plus the bonus once posted)', (await ids({ view: 'income', includeLoans: 'false' })).every((t: string) => !/Eric|John/.test(t)), true);
    const exp = await ids({ view: 'expense' });
    check('expense: groceries, repayments I made and money I lent', [exp.includes('Groceries'), exp.includes('Repaid John'), exp.includes('Lent to Eric')], [true, true, true]);
    check('expense, loans off: groceries only', (await ids({ view: 'expense', includeLoans: 'false' })), ['Groceries']);
    // Every debt is recorded now, in any currency, so the USD debt has its own row too.
    check('debt: borrowed + repayments I made', await ids({ view: 'debt' }), ['Borrowed from Dollar Dan', 'Borrowed from John', 'Repaid John']);
    check('credit: lent + repayments I received', await ids({ view: 'credit' }), ['Lent to Eric', 'Repayment from Eric']);
    check('debt and credit are shown even with loans off', [(await ids({ view: 'debt', includeLoans: 'false' })).length, (await ids({ view: 'credit', includeLoans: 'false' })).length], [3, 2]);
    check('an unknown view means all', (await ids({ view: 'rm -rf' })).length, everything.length);
    check('a chip combines with search', await ids({ view: 'debt', search: 'Repaid' }), ['Repaid John']);
    check('a chip combines with the old type filter', await ids({ view: 'debt', type: 'income' }), ['Borrowed from Dollar Dan', 'Borrowed from John']);
    check('recent honours the chip too', (await transactions.findRecent(personalScope(A), 10, 'credit')).map((t: any) => t.title).sort(), ['Lent to Eric', 'Repayment from Eric']);
    check('history groups honour the chip', (await transactions.history(personalScope(A), { view: 'debt' })).flatMap((g: any) => g.items.map((i: any) => i.title)).sort(), ['Borrowed from Dollar Dan', 'Borrowed from John', 'Repaid John']);

    // scheduled chip: nothing yet, then what a schedule posted
    check('scheduled: nothing posted yet', (await ids({ view: 'scheduled' })).length, 0);
    const bonus = (await prisma.scheduledOccurrence.findMany({ where: { scheduleId: dueNow.id } }))[0];
    await scheduled.confirm(A, bonus.id);
    check('scheduled: the posted transaction appears', await ids({ view: 'scheduled' }), ['Bonus']);
    check('another person\'s feed is empty', (await transactions.findAll(personalScope(B), { view: 'debt' } as any)).data.length, 0);
  } finally {
    await prisma.client.deleteMany({ where: { id: { in: made } } });
    await prisma.$disconnect();
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
