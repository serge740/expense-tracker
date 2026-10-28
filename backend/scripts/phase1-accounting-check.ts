/**
 * Phase 1 end-to-end accounting check. Runs the REAL DebtsService / ReportsService /
 * BudgetService against whatever DATABASE_URL points to, so ONLY run it on a scratch copy:
 *
 *   DATABASE_URL="mysql://root@localhost:3306/p1test" npx ts-node scripts/phase1-accounting-check.ts
 *
 * It creates its own client + wallets and removes everything it created at the end.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { DebtsService } from '../src/modules/debts/debts.service';
import { DebtPlanService } from '../src/modules/debts/debt-plan.service';
import { makeReminders } from './_fakes';
import { ReportsService } from '../src/modules/reports/reports.service';
import { BudgetService } from '../src/modules/budget/budget.service';

let failures = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`}`);
};

async function main() {
  if (!/p1test|scratch|_test/i.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('Refusing to run: DATABASE_URL must point at a scratch database (name containing p1test / scratch / _test).');
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  const notifications = new NotificationsService(prisma);
  notifications.notify = () => undefined; // no pushes from a test
  const debts = new DebtsService(prisma, notifications, makeReminders(prisma).reminders, new DebtPlanService(prisma));
  const reports = new ReportsService(prisma);
  const budget = new BudgetService(prisma);

  const stamp = Date.now();
  const client = await prisma.client.create({
    data: { firstName: 'Check', email: `check${stamp}@example.com`, phone: `+000${stamp}`, isVerified: true },
  });
  const cid = client.id;
  const mkWallet = (name: string, balance: number) =>
    prisma.wallet.create({ data: { clientId: cid, name, bank: 'Test', currency: 'RWF', balance } });
  const bal = async (id: string) => Number((await prisma.wallet.findUniqueOrThrow({ where: { id } })).balance);
  const sumTx = async (type: 'INCOME' | 'EXPENSE') => (await reports.summary(cid, new Date().getMonth() + 1, new Date().getFullYear()))[type === 'INCOME' ? 'totalIncome' : 'totalExpense'];

  try {
    const w = await mkWallet('Main', 100000);

    // ── Debt (I owe): borrow 10,000 ────────────────────────────────────────────
    // A debt never uses one of my wallets: it is recorded under the Debt wallet and no balance moves.
    let d = await debts.create(cid, { kind: 'BORROWED', person: 'Alice', amount: 10000, currency: 'RWF', dueDate: new Date(Date.now() + 864e5).toISOString() });
    check('borrow: no wallet moves (debts never touch my wallets)', await bal(w.id), 100000);
    const principal = await prisma.transaction.findUniqueOrThrow({ where: { id: d.principalTransactionId } });
    check('borrow: principal tagged BORROW_IN, recorded without a wallet', [principal.debtRole, principal.walletId, principal.type], ['BORROW_IN', null, 'INCOME']);
    check('borrow: principal linked on the debt', d.principalTransactionId, principal.id);
    check('borrow: NOT counted as income', await sumTx('INCOME'), 0);
    check('borrow: remaining 10,000', d.remaining, 10000);

    // ── Repay 2,000 then 3,000 ────────────────────────────────────────────────
    d = await debts.addPayment(cid, d.id, { amount: 2000 });
    check('repay 2,000: no wallet moves', await bal(w.id), 100000);
    check('repay 2,000: counted as expense', await sumTx('EXPENSE'), 2000);
    check('repay 2,000: remaining 8,000', d.remaining, 8000);
    d = await debts.addPayment(cid, d.id, { amount: 3000 });
    check('repay 3,000: remaining 5,000, still OPEN', [d.remaining, d.status], [5000, 'OPEN']);

    const spendWithLoans = (await reports.summary(cid, new Date().getMonth() + 1, new Date().getFullYear())).totalExpense;
    const spendNoLoans = (await reports.summary(cid, new Date().getMonth() + 1, new Date().getFullYear(), undefined, undefined, false)).totalExpense;
    check('reports: loans included = 5,000', spendWithLoans, 5000);
    check('reports: includeLoans=false = 0', spendNoLoans, 0);
    check('budget spent ignores debt flows', (await budget.getCurrent(cid)).spent, 0);

    // ── Remove a payment: paid is re-summed and wallet restored ───────────────
    const firstPayment = d.payments.find((p: any) => Number(p.amount) === 2000);
    d = await debts.removePayment(cid, d.id, firstPayment.id);
    check('remove payment: its transaction is removed, wallets untouched', [await bal(w.id), await prisma.transaction.count({ where: { debtId: d.id } })], [100000, 2]);       // the borrow and the 3,000 repayment are left
    check('remove payment: paid re-summed to 3,000, remaining 7,000', [d.paid, d.remaining], [3000, 7000]);

    // ── Edit the amount: principal + wallet adjust together ───────────────────
    d = await debts.update(cid, d.id, { amount: 12000 });
    check('amount 10,000 → 12,000: wallets untouched', await bal(w.id), 100000);
    check('amount edit: principal transaction updated', Number((await prisma.transaction.findUniqueOrThrow({ where: { id: d.principalTransactionId } })).amount), 12000);
    let rejected = false;
    try { await debts.update(cid, d.id, { amount: 2000 }); } catch { rejected = true; }
    check('amount below what was paid is rejected', rejected, true);

    // ── Pay the rest → SETTLED, then over-pay is blocked ──────────────────────
    d = await debts.addPayment(cid, d.id, { amount: 9000 });
    check('fully paid → SETTLED', [d.status, d.remaining], ['SETTLED', 0]);
    rejected = false;
    try { await debts.addPayment(cid, d.id, { amount: 1 }); } catch { rejected = true; }
    check('paying a closed debt is blocked', rejected, true);

    // ── Credit (owed to me): lend 10,000, receive 2,000 ───────────────────────
    const w2 = await mkWallet('Savings', 50000);
    let c = await debts.create(cid, { kind: 'LENT', person: 'Bob', amount: 10000, walletId: w2.id });
    check('lend: wallet -10,000', await bal(w2.id), 40000);
    check('lend: tagged LEND_OUT', (await prisma.transaction.findUniqueOrThrow({ where: { id: c.principalTransactionId } })).debtRole, 'LEND_OUT');
    c = await debts.addPayment(cid, c.id, { amount: 2000, walletId: w2.id });
    check('receive 2,000: wallet +2,000', await bal(w2.id), 42000);
    check('receive 2,000: remaining 8,000 (the 10,000 − 2,000 case)', c.remaining, 8000);
    check('receive 2,000: counted as income', await sumTx('INCOME'), 2000);

    // A credit with no wallet is still recorded (as money out / in) and moves no balance.
    const noWallet = await debts.create(cid, { kind: 'LENT', person: 'Cara', amount: 4000, currency: 'RWF' });
    const nwTx = await prisma.transaction.findUniqueOrThrow({ where: { id: noWallet.principalTransactionId } });
    check('credit without a wallet: still recorded as LEND_OUT expense, no wallet', [nwTx.debtRole, nwTx.type, nwTx.walletId, await bal(w2.id)], ['LEND_OUT', 'EXPENSE', null, 42000]);
    const nwPaid = await debts.addPayment(cid, noWallet.id, { amount: 1000 });
    check('repayment without a wallet: still recorded as REPAY_IN income', [(await prisma.transaction.findMany({ where: { debtId: noWallet.id, debtRole: 'REPAY_IN' } })).length, nwPaid.remaining], [1, 3000]);

    // An older app may still send a wallet for a debt: it is ignored.
    const oldApp = await debts.create(cid, { kind: 'BORROWED', person: 'Dan', amount: 700, currency: 'RWF', walletId: w.id });
    const oldAppPaid = await debts.addPayment(cid, oldApp.id, { amount: 100, walletId: w.id });
    check('a wallet sent for a debt is ignored', [oldApp.walletId, oldAppPaid.payments[0].walletId, await bal(w.id)], [null, null, 100000]);

    // ── Write off the remainder, then reopen ──────────────────────────────────
    c = await debts.writeOff(cid, c.id);
    check('write-off: WRITTEN_OFF, remaining 0, writtenOff 8,000', [c.status, c.remaining, c.writtenOffAmount], ['WRITTEN_OFF', 0, 8000]);
    check('write-off moves no cash', await bal(w2.id), 42000);
    c = await debts.reopen(cid, c.id);
    check('reopen: OPEN again with 8,000 remaining', [c.status, c.remaining], ['OPEN', 8000]);

    // ── Ledgers ───────────────────────────────────────────────────────────────
    const debtLedger = await debts.ledger(cid, 'BORROWED');
    check('debt ledger: Alice settled, Dan still open', [debtLedger.currencies[0].taken, debtLedger.currencies[0].paid, debtLedger.currencies[0].remaining, debtLedger.settledCount], [12700, 12100, 600, 1]);
    const creditLedger = await debts.ledger(cid, 'LENT');
    check('credit ledger: Bob + Cara', [creditLedger.currencies[0].taken, creditLedger.currencies[0].paid, creditLedger.currencies[0].remaining], [14000, 3000, 11000]);
    const ledgerTx = await debts.ledgerTransactions(cid, 'BORROWED');
    check('debt ledger transactions: Alice (borrow + 2 repayments) and Dan (borrow + 1 repayment)', ledgerTx.total, 5);
    const related = await debts.transactionsOf(cid, c.id);
    check('credit related transactions: lend + repayment', related.map((t: any) => t.debtRole).sort(), ['LEND_OUT', 'REPAY_IN']);

    // ── Archive hides it from lists and ledger, restore brings it back ───────
    await debts.archive(cid, c.id);
    check('archived credit leaves the list', (await debts.list(cid, 'LENT')).length, 1);          // Cara is still there
    check('archived credit leaves the ledger', (await debts.ledger(cid, 'LENT')).debtCount, 1);
    await debts.restore(cid, c.id);
    check('restored credit is back', (await debts.list(cid, 'LENT')).length, 2);

    // ── Delete a debt: wallet effects fully reversed ──────────────────────────
    await debts.remove(cid, c.id);
    check('delete credit: wallet back to 50,000', await bal(w2.id), 50000);
  } finally {
    await prisma.transaction.deleteMany({ where: { clientId: cid } });
    await prisma.debt.deleteMany({ where: { clientId: cid } });
    await prisma.wallet.deleteMany({ where: { clientId: cid } });
    await prisma.client.delete({ where: { id: cid } });
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
