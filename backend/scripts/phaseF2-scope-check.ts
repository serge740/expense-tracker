/**
 * Phase F2 isolation check. Runs the REAL wallet, transaction, budget, reports and home services against whatever
 * DATABASE_URL points to, so ONLY run it on a scratch copy:
 *
 *   DATABASE_URL="mysql://root@localhost:3306/p1test_family" npx prisma migrate deploy
 *   DATABASE_URL="mysql://root@localhost:3306/p1test_family" npx ts-node scripts/phaseF2-scope-check.ts
 *
 * People: A has no family. B owns family 1, with Grace (Member) and Kevin (Viewer). C owns family 2. D is outside both.
 * It proves nobody sees, changes or reaches money outside their own scope, and that the numbers add up.
 * It creates its own accounts and removes everything it created at the end.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { FamilyAccessService } from '../src/modules/family/family-access.service';
import { FamilyService } from '../src/modules/family/family.service';
import { FamilyInvitesService } from '../src/modules/family/family-invites.service';
import { ScopeService } from '../src/modules/family/scope/scope.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { TransactionService } from '../src/modules/transaction/transaction.service';
import { BudgetService } from '../src/modules/budget/budget.service';
import { ReportsService } from '../src/modules/reports/reports.service';
import { HomeService } from '../src/modules/home/home.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { DebtsService } from '../src/modules/debts/debts.service';
import { DebtPlanService } from '../src/modules/debts/debt-plan.service';
import { ScheduledService } from '../src/modules/scheduled/scheduled.service';
import { makeReminders } from './_fakes';

let failures = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`}`);
};
const codeOf = async (p: Promise<unknown>) => {
  try { await p; return 'OK'; } catch (e: any) { return e?.response?.code ?? e?.message ?? `ERR`; }
};
const sorted = <T,>(a: T[]) => [...a].sort();

async function main() {
  if (!/p1test|scratch|_test/i.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('Refusing to run: DATABASE_URL must point at a scratch database (name containing p1test / scratch / _test).');
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  const notifications = new NotificationsService(prisma);
  notifications.notify = () => undefined;
  const access = new FamilyAccessService(prisma);
  const families = new FamilyService(prisma, access);
  const invites = new FamilyInvitesService(prisma, access, families);
  const scopes = new ScopeService(access);
  const fx = { rate: async (a: string, b: string) => (a === b ? 1 : 2), ratesFor: async (_b: string, codes: string[]) => Object.fromEntries(codes.map(c => [c, 1])), updatedAt: null } as any;
  const wallets = new WalletService(prisma, fx, notifications);
  const transactions = new TransactionService(prisma, notifications);
  const budgets = new BudgetService(prisma);
  const reports = new ReportsService(prisma);
  const { reminders } = makeReminders(prisma);
  const debts = new DebtsService(prisma, notifications, reminders, new DebtPlanService(prisma));
  const scheduled = new ScheduledService(prisma, transactions, notifications, reminders);
  const home = new HomeService(prisma, debts, scheduled);

  const stamp = Date.now().toString(36);
  const ids: Record<string, string> = {};
  const familyIds: string[] = [];
  const now = new Date();
  const month = now.getMonth() + 1, year = now.getFullYear();
  try {
    let n = 0;
    for (const name of ['A', 'B', 'Grace', 'Kevin', 'C', 'D']) {
      const c = await prisma.client.create({
        data: { firstName: name, lastName: 'Scope', email: `${name.toLowerCase()}.${stamp}@f2check.test`, phone: `+2507${stamp.slice(-5)}${n++}`, emailVerifiedAt: new Date(), isVerified: true },
      });
      ids[name] = c.id;
    }
    const { A, B, Grace, Kevin, C, D } = ids;

    const f1 = (await families.create(B, { name: 'Family One' })).family.id as string;
    const f2 = (await families.create(C, { name: 'Family Two' })).family.id as string;
    familyIds.push(f1, f2);
    for (const [who, role] of [[Grace, 'MEMBER'], [Kevin, 'VIEWER']] as const) {
      const inv = await invites.create(B, f1, { role });
      await invites.accept(who, { code: inv.code });
    }
    const personal = (who: string) => scopes.resolve(who, undefined);
    const fam = (who: string, familyId: string) => scopes.resolve(who, familyId);

    console.log('\n— who may stand where —');
    check('no header is Personal, even for a family member', (await personal(Grace)).kind, 'personal');
    check('a member gets their family', (await fam(Grace, f1)).kind, 'family');
    check('someone from another family is refused', await codeOf(fam(C, f1)), 'NOT_A_MEMBER');
    check('someone with no family is refused', await codeOf(fam(D, f1)), 'NOT_A_MEMBER');
    check('a made-up family id is refused the same way', await codeOf(fam(B, 'does-not-exist-12345')), 'NOT_A_MEMBER');

    console.log('\n— building the money —');
    const wA = await wallets.create(await personal(A), { name: 'A-main', bank: 'T', balance: 1000 } as any);
    const wBp = await wallets.create(await personal(B), { name: 'B-private', bank: 'T', balance: 500 } as any);
    const wGp = await wallets.create(await personal(Grace), { name: 'Grace-private', bank: 'T', balance: 300 } as any);
    const wF1 = await wallets.create(await fam(B, f1), { name: 'F1-house', bank: 'T', balance: 10000, accountNumber: '9999 8888' } as any);
    const wF1b = await wallets.create(await fam(B, f1), { name: 'F1-school', bank: 'T', balance: 2000 } as any);
    const wF2 = await wallets.create(await fam(C, f2), { name: 'F2-house', bank: 'T', balance: 7000 } as any);
    check('a Member cannot create a family wallet', await codeOf(wallets.create(await fam(Grace, f1), { name: 'x', bank: 'T' } as any)), 'FORBIDDEN_ACTION');

    const spend = (walletId: string, amount: number, title: string) => ({ type: 'EXPENSE', category: 'food', title, amount, walletId }) as any;
    await transactions.create(await personal(A), spend(wA.id, 100, 'A lunch'));
    await transactions.create(await personal(B), spend(wBp.id, 50, 'B private coffee'));
    await transactions.create(await personal(Grace), spend(wGp.id, 30, 'Grace private snack'));
    await transactions.create(await fam(B, f1), spend(wF1.id, 400, 'F1 rent share'));
    await transactions.create(await fam(Grace, f1), spend(wF1.id, 150, 'F1 groceries (Grace)'));
    await transactions.create(await fam(B, f1), { type: 'INCOME', category: 'salary', title: 'F1 contribution', amount: 1000, walletId: wF1.id } as any);
    await transactions.create(await fam(C, f2), spend(wF2.id, 70, 'F2 fuel'));

    console.log('\n— wallets: everyone sees only their own scope —');
    const names = async (s: any) => sorted((await wallets.findAll(await s)).map((w: any) => w.name));
    check('A (no family)', await names(personal(A)), ['A-main']);
    check('B in Personal', await names(personal(B)), ['B-private']);
    check('B in Family 1', await names(fam(B, f1)), ['F1-house', 'F1-school']);
    check('Grace in Personal', await names(personal(Grace)), ['Grace-private']);
    check('Grace in Family 1', await names(fam(Grace, f1)), ['F1-house', 'F1-school']);
    check('C in Family 2', await names(fam(C, f2)), ['F2-house']);
    check('D (outside everything) has none', await names(personal(D)), []);

    console.log('\n— a wallet id from another scope is "not found" —');
    check('A asking for a family wallet', await codeOf(wallets.findOne(await personal(A), wF1.id)), 'WALLET_NOT_FOUND');
    check('B in Personal asking for the family wallet', await codeOf(wallets.findOne(await personal(B), wF1.id)), 'WALLET_NOT_FOUND');
    check('B in Family asking for a personal wallet', await codeOf(wallets.findOne(await fam(B, f1), wBp.id)), 'WALLET_NOT_FOUND');
    check('C in Family 2 asking for Family 1 wallet', await codeOf(wallets.findOne(await fam(C, f2), wF1.id)), 'WALLET_NOT_FOUND');
    check('A cannot change B\'s wallet', await codeOf(wallets.update(await personal(A), wBp.id, { name: 'hacked' } as any)), 'WALLET_NOT_FOUND');
    check('A cannot delete a family wallet', await codeOf(wallets.remove(await personal(A), wF1.id)), 'WALLET_NOT_FOUND');
    check('a body that names clientId/familyId cannot move a wallet', await (async () => {
      await wallets.update(await personal(A), wA.id, { name: 'A-main', clientId: B, familyId: f1 } as any);
      const row = await prisma.wallet.findUnique({ where: { id: wA.id } });
      return [row?.clientId === A, row?.familyId];
    })(), [true, null]);

    console.log('\n— family wallet details —');
    check('the Owner sees the account number', (await wallets.findOne(await fam(B, f1), wF1.id) as any).accountNumber, '99998888');
    check('a Member does not', (await wallets.findOne(await fam(Grace, f1), wF1.id) as any).accountNumber, null);
    check('a Viewer does not', (await wallets.findOne(await fam(Kevin, f1), wF1.id) as any).accountNumber, null);

    console.log('\n— transactions: lists, recent, history —');
    const titles = async (s: any) => sorted(((await transactions.findAll(await s, { limit: 50 } as any)) as any).data.map((t: any) => t.title));
    check('A', await titles(personal(A)), ['A lunch']);
    check('B in Personal (no family rows leak in)', await titles(personal(B)), ['B private coffee']);
    check('B in Family 1', await titles(fam(B, f1)), ['F1 contribution', 'F1 groceries (Grace)', 'F1 rent share']);
    check('Grace in Personal', await titles(personal(Grace)), ['Grace private snack']);
    check('Kevin (viewer) can read Family 1', await titles(fam(Kevin, f1)), ['F1 contribution', 'F1 groceries (Grace)', 'F1 rent share']);
    check('C in Family 2', await titles(fam(C, f2)), ['F2 fuel']);
    check('recent: B in Personal', sorted((await transactions.findRecent(await personal(B), 10)).map((t: any) => t.title)), ['B private coffee']);
    check('recent: B in Family 1', (await transactions.findRecent(await fam(B, f1), 10)).length, 3);
    const hist = async (s: any) => sorted((await transactions.history(await s, {} as any) as any[]).flatMap(g => g.items.map((i: any) => i.title)));
    check('history: Grace in Personal', await hist(personal(Grace)), ['Grace private snack']);
    check('history: Grace in Family 1', await hist(fam(Grace, f1)), ['F1 contribution', 'F1 groceries (Grace)', 'F1 rent share']);
    const graceOnly = ((await transactions.findAll(await fam(B, f1), { memberId: Grace, limit: 50 } as any)) as any).data.map((t: any) => [t.title, t.author.name]);
    check('"only what Grace added" in Family 1, with the author', graceOnly, [['F1 groceries (Grace)', 'Grace Scope']]);

    console.log('\n— using another scope\'s ids —');
    const f1tx = await prisma.transaction.findFirst({ where: { familyId: f1, title: 'F1 rent share' } });
    const btx = await prisma.transaction.findFirst({ where: { familyId: null, title: 'B private coffee' } });
    check('A cannot delete a family transaction', await codeOf(transactions.remove(await personal(A), f1tx!.id)), 'Transaction not found');
    check('C cannot edit a Family 1 transaction', await codeOf(transactions.update(await fam(C, f2), f1tx!.id, { title: 'x' })), 'Transaction not found');
    check('B in Family cannot reach a personal transaction', await codeOf(transactions.remove(await fam(B, f1), btx!.id)), 'Transaction not found');
    check('A cannot add to B\'s wallet', await codeOf(transactions.create(await personal(A), spend(wBp.id, 999, 'steal'))), 'WALLET_NOT_FOUND');
    check('A cannot add to a family wallet', await codeOf(transactions.create(await personal(A), spend(wF1.id, 999, 'steal'))), 'WALLET_NOT_FOUND');
    check('C cannot add to Family 1\'s wallet', await codeOf(transactions.create(await fam(C, f2), spend(wF1.id, 999, 'steal'))), 'WALLET_NOT_FOUND');
    check('B cannot use a personal wallet for the family', await codeOf(transactions.create(await fam(B, f1), spend(wBp.id, 5, 'mix'))), 'WRONG_SCOPE');
    check('B cannot use the family wallet for a personal expense', await codeOf(transactions.create(await personal(B), spend(wF1.id, 5, 'mix'))), 'WALLET_NOT_FOUND');
    check('a Viewer cannot add', await codeOf(transactions.create(await fam(Kevin, f1), spend(wF1.id, 1, 'x'))), 'FORBIDDEN_ACTION');
    check('a Member cannot delete the Owner\'s entry', await codeOf(transactions.remove(await fam(Grace, f1), f1tx!.id)), 'FORBIDDEN_ACTION');
    check('none of that moved any money', (await prisma.wallet.findMany({ where: { id: { in: [wA.id, wBp.id, wF1.id, wF2.id] } }, orderBy: { name: 'asc' } })).map(w => [w.name, Number(w.balance)]),
      [['A-main', 900], ['B-private', 450], ['F1-house', 10450], ['F2-house', 6930]]);

    console.log('\n— transfers stay inside one scope —');
    check('family wallet → personal wallet', await codeOf(wallets.transfer(await fam(B, f1), { fromWalletId: wF1.id, toWalletId: wBp.id, amount: 10 })), 'WRONG_SCOPE');
    check('personal wallet → family wallet', await codeOf(wallets.transfer(await personal(B), { fromWalletId: wBp.id, toWalletId: wF1.id, amount: 10 })), 'WALLET_NOT_FOUND');
    await wallets.transfer(await fam(Grace, f1), { fromWalletId: wF1.id, toWalletId: wF1b.id, amount: 450 });
    const tr = await prisma.transaction.findFirst({ where: { type: 'TRANSFER', familyId: f1 } });
    check('a family transfer belongs to the family and its author', [tr?.familyId, tr?.clientId === Grace], [f1, true]);
    check('and balances moved', (await prisma.wallet.findMany({ where: { id: { in: [wF1.id, wF1b.id] } }, orderBy: { name: 'asc' } })).map(w => Number(w.balance)), [10000, 2450]);

    console.log('\n— budgets —');
    await budgets.upsert(await personal(B), { limit: 111 });
    await budgets.upsert(await fam(B, f1), { limit: 9999 });
    await budgets.upsert(await fam(C, f2), { limit: 5 });
    check('B has a personal and a family budget for the same month (real unique index)', await prisma.budget.count({ where: { clientId: B } }), 2);
    check('B personal', (await budgets.getCurrent(await personal(B))).limit, 111);
    check('B family', (await budgets.getCurrent(await fam(B, f1))).limit, 9999);
    check('Kevin reads the family budget', (await budgets.getCurrent(await fam(Kevin, f1))).limit, 9999);
    check('C sees only its own', (await budgets.getCurrent(await fam(C, f2))).limit, 5);
    check('a Member cannot set the family budget', await codeOf(budgets.upsert(await fam(Grace, f1), { limit: 1 })), 'FORBIDDEN_ACTION');
    check('spending counts only inside its scope (family 1 spent 550, B personal 50)', [(await budgets.getCurrent(await fam(B, f1))).spent, (await budgets.getCurrent(await personal(B))).spent], [550, 50]);
    await budgets.upsert(await personal(B), { limit: 222 });
    check('setting it again updates, not duplicates', await prisma.budget.count({ where: { scopeKey: `p:${B}` } }), 1);

    console.log('\n— reports and home —');
    const sum = async (s: any) => { const r: any = await reports.summary(await s, month, year); return [r.totalIncome, r.totalExpense]; };
    check('summary A', await sum(personal(A)), [0, 100]);
    check('summary B personal', await sum(personal(B)), [0, 50]);
    check('summary B family 1', await sum(fam(B, f1)), [1000, 550]);
    check('summary C family 2', await sum(fam(C, f2)), [0, 70]);
    check('summary D (nothing)', await sum(personal(D)), [0, 0]);
    const cats = async (s: any) => ((await reports.byCategory(await s, month, year)) as any[]).map(c => [c.category, c.amount]);
    check('by category B personal', await cats(personal(B)), [['food', 50]]);
    check('by category B family 1', await cats(fam(B, f1)), [['food', 550]]);
    const top = async (s: any) => ((await reports.topExpenses(await s, month, year, 10)) as any[]).map(t => t.title).sort();
    check('top expenses B personal', await top(personal(B)), ['B private coffee']);
    check('top expenses family 1', await top(fam(B, f1)), ['F1 groceries (Grace)', 'F1 rent share']);
    const monthly = async (s: any) => ((await reports.monthly(await s, year, 12)) as any[]).reduce((a, m) => a + Number(m.total ?? 0), 0);
    check('monthly totals follow the scope', [await monthly(personal(B)), await monthly(fam(B, f1))], [50, 550]);
    const homeOf = async (s: any) => { const h: any = await home.summary(await s, month, year); return [h.totals.income, h.totals.expense, h.netWorth.map((x: any) => x.total)]; };
    check('home: B personal', await homeOf(personal(B)), [0, 50, [450]]);
    check('home: B family 1 (wallets 10000-450 transfer + 2450 = 12450 after the 400+150 spends and +1000)', await homeOf(fam(B, f1)), [1000, 550, [12450]]);
    const fh: any = await home.summary(await fam(B, f1), month, year);
    check('home in a family has no loans, debts or schedules', [fh.owe, fh.owed, fh.attention.length, fh.scheduled.waiting], [{}, {}, 0, 0]);
    check('wallet totals per scope', [(await wallets.summary(await personal(B))).totalBalance, (await wallets.summary(await fam(B, f1))).totalBalance], [450, 12450]);
    check('activity per scope', [(await wallets.activity(await personal(B), 50)).length, (await wallets.activity(await fam(B, f1), 50)).length], [1, 4]);
    check('daily flow per scope (out)', [(await wallets.dailyFlow(await personal(B), 'RWF', 7)).totalOut, (await wallets.dailyFlow(await fam(B, f1), 'RWF', 7)).totalOut], [50, 550]);

    console.log('\n— personal-only features cannot touch family wallets —');
    check('a schedule cannot use a family wallet', await codeOf((scheduled as any).checkWallet(B, wF1.id)), 'Wallet not found');
    check('a debt cannot use a family wallet', await codeOf((debts as any).wallet(B, wF1.id, 'RWF')), 'Wallet not found');
    check('creating a credit from a family wallet is refused', await codeOf(debts.create(B, { kind: 'LENT', person: 'X', amount: 10, walletId: wF1.id, currency: 'RWF' } as any)), 'Wallet not found');

    console.log('\n— two people spending at once —');
    const before = Number((await prisma.wallet.findUnique({ where: { id: wF1.id } }))!.balance);
    const sB = await fam(B, f1), sG = await fam(Grace, f1);
    await Promise.all(Array.from({ length: 12 }, (_, i) => transactions.create(i % 2 ? sB : sG, spend(wF1.id, 10, `race ${i}`))));
    check('twelve parallel expenses on one family wallet', Number((await prisma.wallet.findUnique({ where: { id: wF1.id } }))!.balance), before - 120);

    console.log('\n— balances add up —');
    for (const [label, w, start] of [['A-main', wA, 1000], ['B-private', wBp, 500], ['Grace-private', wGp, 300], ['F2-house', wF2, 7000]] as const) {
      const txs = await prisma.transaction.findMany({ where: { OR: [{ walletId: w.id }, { toWalletId: w.id }] } });
      const effect = txs.reduce((s, t) => s + (t.type === 'INCOME' ? Number(t.amount) : t.type === 'TRANSFER' ? (t.toWalletId === w.id ? Number(t.toAmount ?? t.amount) : -Number(t.amount)) : -Number(t.amount)), 0);
      const bal = Number((await prisma.wallet.findUnique({ where: { id: w.id } }))!.balance);
      check(`${label}: start + transactions = balance`, bal, start + effect);
    }
    for (const [label, w, start] of [['F1-house', wF1, 10000], ['F1-school', wF1b, 2000]] as const) {
      const txs = await prisma.transaction.findMany({ where: { OR: [{ walletId: w.id }, { toWalletId: w.id }] } });
      const effect = txs.reduce((s, t) => s + (t.type === 'INCOME' ? Number(t.amount) : t.type === 'TRANSFER' ? (t.toWalletId === w.id ? Number(t.toAmount ?? t.amount) : -Number(t.amount)) : -Number(t.amount)), 0);
      const bal = Number((await prisma.wallet.findUnique({ where: { id: w.id } }))!.balance);
      check(`${label}: start + transactions = balance`, bal, start + effect);
    }
    const mixed = await prisma.$queryRaw<any[]>`SELECT t.id FROM \`Transaction\` t JOIN \`Wallet\` w ON w.id = t.walletId WHERE NOT (t.familyId <=> w.familyId) AND t.title NOT LIKE 'steal%'`;
    check('no transaction sits in a different scope from its wallet', mixed.length, 0);

    console.log('\n— a removed member is out on the very next request —');
    await families.removeMember(B, f1, Grace);
    check('Grace asking for the family now', await codeOf(fam(Grace, f1)), 'NOT_A_MEMBER');
    check('Grace\'s personal money is untouched', await names(personal(Grace)), ['Grace-private']);
    check('Family 1 keeps her old entries, labelled', (((await transactions.findAll(await fam(B, f1), { limit: 50 } as any)) as any).data.filter((t: any) => t.title.startsWith('F1 groceries')).map((t: any) => t.author.clientId === Grace)), [true]);
    check('an archived family is gone for everyone', await (async () => { await families.archive(C, f2, 'Family Two'); return codeOf(fam(C, f2)); })(), 'NOT_A_MEMBER');
  } finally {
    await prisma.family.deleteMany({ where: { id: { in: familyIds } } });      // cascades its wallets, transactions and budgets
    await prisma.client.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
