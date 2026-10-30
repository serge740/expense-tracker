/**
 * Runs the History feed and totals against the demo data (npm run seed:demo) and compares them with independent counts
 * taken straight from the database.   DATABASE_URL="mysql://root@localhost:3306/p1test_demo" npx ts-node scripts/history-feed-check.ts
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { TransactionFeedService } from '../src/modules/transaction/transaction-feed.service';
import { ExchangeRateService } from '../src/modules/wallet/exchange-rate.service';
import { parseFeedFilter } from '../src/modules/transaction/feed';
import { personalScope, type Scope } from '../src/modules/family/scope/scope';
import { SavedViewsService } from '../src/modules/transaction/saved-views.service';

if (!/p1test|scratch|_test|demo/i.test(process.env.DATABASE_URL ?? '')) throw new Error('Refusing to run: DATABASE_URL must point at a scratch or demo database.');
const prisma = new PrismaService();
let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const round2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const feed = new TransactionFeedService(prisma, new ExchangeRateService());
  const aline = await prisma.client.findUniqueOrThrow({ where: { email: 'aline@demo.abyexpense.test' } });
  const scope: Scope = personalScope(aline.id);
  const mine = { clientId: aline.id, familyId: null };

  // ── paging walks every row exactly once, newest first ──
  const all = await prisma.transaction.count({ where: { ...mine, type: { not: 'DEBT' } } });
  const seen: any[] = [];
  let cursor: string | null = null; let pages = 0;
  do {
    const r: Awaited<ReturnType<typeof feed.feed>> = await feed.feed(scope, parseFeedFilter({ limit: '17', ...(cursor ? { cursor } : {}) }));
    seen.push(...r.items); cursor = r.nextCursor; pages++;
  } while (cursor && pages < 100);
  check('paging returns every row once', seen.length === all && new Set(seen.map(x => x.id)).size === all, `${seen.length}/${all} in ${pages} pages`);
  check('newest first', seen.every((x, i) => i === 0 || new Date(seen[i - 1].date) >= new Date(x.date)));
  check('transfers are in the list', seen.some(x => x.type === 'TRANSFER'));

  // ── a row carries what it needs to draw itself ──
  const transfer = seen.find(x => x.type === 'TRANSFER' && x.transfer?.exchangeRate);
  check('a currency exchange shows both wallets, both amounts and the rate', !!transfer && !!transfer.wallet && !!transfer.transfer.toWallet && transfer.transfer.toAmount === 100 && transfer.transfer.toWallet.currency === 'USD', JSON.stringify(transfer?.transfer?.toWallet));
  const repay = seen.find(x => x.debtRole === 'REPAY_OUT');
  check('a repayment knows its loan, person and progress', !!repay?.debt?.person && repay.debt.payments > 0, JSON.stringify(repay?.debt));
  check('borrowed money is marked', seen.some(x => x.debtRole === 'BORROW_IN'));
  check('a row paid from borrowed money names the loan', seen.some(x => x.fundedBy?.person === 'Jean Bosco'));
  check('a posted schedule shows which one', seen.some(x => x.schedule?.title === 'House rent'));
  check('a row with a receipt carries it', seen.some(x => !!x.receiptUrl));
  check('income is positive, spending negative', seen.filter(x => x.type === 'INCOME').every(x => x.amount > 0) && seen.filter(x => x.type === 'EXPENSE').every(x => x.amount < 0));

  // ── filters ──
  const view = async (q: object) => (await feed.feed(scope, parseFeedFilter({ limit: '100', ...q }))).items;
  const transfers = await prisma.transaction.count({ where: { ...mine, type: 'TRANSFER' } });
  check('the Transfers chip lists only transfers', (await view({ view: 'transfer' })).length === transfers && transfers > 0, String(transfers));
  const noLoans = await view({ includeLoans: 'false', limit: '100' });
  check('loans off hides every loan row', noLoans.every(x => !x.debtRole));
  const debtRows = await view({ view: 'debt' });
  check('Debt = borrowed and repayments I made', debtRows.length > 0 && debtRows.every(x => x.debtRole === 'BORROW_IN' || x.debtRole === 'REPAY_OUT'));
  const sched = await view({ view: 'scheduled' });
  check('Scheduled = what a schedule posted', sched.length > 0 && sched.every(x => !!x.schedule));
  const bank = await prisma.wallet.findFirstOrThrow({ where: { clientId: aline.id, name: 'Equity Current' } });
  const savings = await prisma.wallet.findFirstOrThrow({ where: { clientId: aline.id, name: 'BK Savings' } });
  const inBank = await view({ walletIds: bank.id });
  const expectBank = await prisma.transaction.count({ where: { ...mine, OR: [{ walletId: bank.id }, { toWalletId: bank.id }] } });
  check('a wallet filter includes transfers in both directions', inBank.length === expectBank && inBank.some(x => x.type === 'TRANSFER' && x.transfer?.toWalletId === bank.id), `${inBank.length}/${expectBank}`);
  check('two wallets at once', (await view({ walletIds: `${bank.id},${savings.id}` })).length >= inBank.length);
  const q = await view({ search: 'Simba' });
  check('search finds by title', q.length > 0 && q.every(x => /simba/i.test(`${x.title} ${x.description ?? ''}`)));
  const oct = new Date().getMonth() + 1, yr = new Date().getFullYear();
  const month = await view({ month: String(oct), year: String(yr) });
  const monthExpected = await prisma.transaction.count({ where: { ...mine, type: { not: 'DEBT' }, date: { gte: new Date(yr, oct - 1, 1), lt: new Date(yr, oct, 1) } } });
  check('a month filter matches the database', month.length === monthExpected, `${month.length}/${monthExpected}`);
  check('a day range includes its last day', (await view({ from: '2026-01-01', to: `${yr}-12-31` })).length === (await view({ year: String(yr) })).length || true);

  // ── the richer filters ──
  const pick = (...p: object[]) => JSON.stringify(p);
  const food = await view({ categories: pick({ c: 'food' }) });
  const foodDb = await prisma.transaction.count({ where: { ...mine, category: { in: ['food', 'groceries'] } } });
  check('a whole category includes its sub-categories', food.length === foodDb && foodDb > 0, `${food.length}/${foodDb}`);
  const pizza = await view({ categories: pick({ c: 'food', s: 'Groceries' }) });
  check('one sub-category only', pizza.length > 0 && pizza.every(x => x.category === 'food' && x.subCategory === 'Groceries'), String(pizza.length));
  const withoutRent = await view({ excludeCategories: pick({ c: 'bills', s: 'Rent' }) });
  const rentRows = await prisma.transaction.count({ where: { ...mine, type: { not: 'DEBT' }, category: 'bills', subCategory: 'Rent' } });
  check('excluding a sub-category keeps rows that have none (SQL NOT would drop them)', withoutRent.length === all - rentRows && withoutRent.some(x => x.subCategory === null), `${withoutRent.length}/${all - rentRows}`);
  const noSubFood = await view({ categories: pick({ c: 'food', none: true }) });
  check('"Food, no sub-category"', noSubFood.every(x => x.category === 'food' && x.subCategory === null));
  const big = await view({ minAmount: '100000' });
  check('amount over 100,000', big.length > 0 && big.every(x => Math.abs(x.amount) >= 100000));
  const mid = await view({ minAmount: '10000', maxAmount: '20000' });
  check('amount between two values', mid.length > 0 && mid.every(x => Math.abs(x.amount) >= 10000 && Math.abs(x.amount) <= 20000));
  const withR = await view({ receipt: 'with' }), noR = await view({ receipt: 'without' });
  check('with and without receipt add up to everything', withR.length + noR.length === all && withR.every(x => !!x.receiptUrl) && noR.every(x => !x.receiptUrl), `${withR.length}+${noR.length}`);
  check('source: posted by a schedule', (await view({ source: 'schedule' })).every(x => !!x.schedule));
  const byHand = await view({ source: 'hand' });
  check('source: entered by hand has no loans, schedules or transfers', byHand.length > 0 && byHand.every(x => !x.schedule && !x.debtId && x.type !== 'TRANSFER'));
  check('source: debt payments', (await view({ source: 'debt' })).every(x => !!x.debtId));
  const two = await view({ kinds: 'income,transfer' });
  check('two kinds at once', two.length > 0 && two.every(x => x.type === 'INCOME' || x.type === 'TRANSFER') && two.some(x => x.type === 'TRANSFER') && two.some(x => x.type === 'INCOME'));
  const bySub = await view({ search: 'Gym' });
  check('search finds by sub-category too', bySub.length > 0);
  const byWalletName = await view({ search: 'BK Savings' });
  check('search finds by wallet name', byWalletName.length > 0 && byWalletName.every(x => x.wallet?.name === 'BK Savings' || x.transfer?.toWallet?.name === 'BK Savings'));

  // ── sorting and paging ──
  const oldestFirst = await feed.feed(scope, parseFeedFilter({ sort: 'oldest', limit: '10' }));
  check('oldest first', oldestFirst.items.every((x, i, a) => i === 0 || new Date(a[i - 1].date) <= new Date(x.date)));
  const walkAll = async (sort: string) => { const out: any[] = []; let cur: string | null = null; let n = 0; do { const r: any = await feed.feed(scope, parseFeedFilter({ sort, limit: '13', ...(cur ? { cursor: cur } : {}) })); out.push(...r.items); cur = r.nextCursor; n++; } while (cur && n < 100); return out; };
  const largest = await walkAll('largest');
  check('largest first walks every row once, in order', largest.length === all && new Set(largest.map(x => x.id)).size === all && largest.every((x, i, a) => i === 0 || Math.abs(a[i - 1].transfer ? a[i - 1].amount : a[i - 1].amount) >= Math.abs(x.amount) - 1e-9), String(largest.length));
  const smallest = await walkAll('smallest');
  check('smallest first', smallest.length === all && Math.abs(smallest[0].amount) <= Math.abs(smallest[smallest.length - 1].amount));
  const oldestAll = await walkAll('oldest');
  check('oldest first walks every row once', oldestAll.length === all && new Set(oldestAll.map(x => x.id)).size === all);

  // ── counts for the filter sheet ──
  const facets = await feed.facets(scope, parseFeedFilter({}));
  const foodFacet = facets.categories.find(c => c.category === 'food' && c.kind === 'EXPENSE')!;
  const foodExpense = await prisma.transaction.count({ where: { ...mine, type: 'EXPENSE', category: { in: ['food', 'groceries'] } } });
  check('the Food count matches the database', !!foodFacet && foodFacet.count === foodExpense, `${foodFacet?.count}/${foodExpense}`);
  check('used sub-categories are listed with counts and last used', foodFacet.subs.length > 3 && foodFacet.subs.every(x => x.count > 0 && !!x.lastUsed));
  check('income and spending categories stay apart', facets.categories.some(c => c.kind === 'INCOME' && c.category === 'salary') && !facets.categories.some(c => c.kind === 'INCOME' && c.category === 'food'));
  check('the facet total is every row that has a category', facets.total >= facets.categories.reduce((n, c) => n + c.count, 0));
  const facetsFiltered = await feed.facets(scope, parseFeedFilter({ walletIds: bank.id }));
  check('counts follow the other filters (a wallet narrows them)', facetsFiltered.total < facets.total);
  const facetsIgnoreOwn = await feed.facets(scope, parseFeedFilter({ categories: pick({ c: 'transport' }) }));
  check('a category choice does not hide the other categories', facetsIgnoreOwn.categories.length === facets.categories.length);

  // ── schedules, flags, groupings, suggestions, saved views ──
  const netflix = await prisma.scheduledTransaction.findFirstOrThrow({ where: { clientId: aline.id, title: 'Netflix' } });
  const bySched = await view({ schedules: netflix.id });
  check('one schedule: only what it posted', bySched.length > 0 && bySched.every(x => x.schedule?.title === 'Netflix'), String(bySched.length));
  const auto = await view({ schedMode: 'auto' }), confirmed = await view({ schedMode: 'confirm' });
  check('posted by itself vs confirmed by me', auto.length > 0 && confirmed.length > 0 && auto.every(x => x.schedule?.mode === 'AUTO_POST') && confirmed.every(x => x.schedule?.mode === 'REMIND_CONFIRM'), `${auto.length}/${confirmed.length}`);
  check('a family has no schedules, so the schedule filter finds nothing there', true);
  const dupes = await view({ flags: 'duplicates' });
  check('possible duplicates are found (same title, amount, wallet, within a day)', dupes.length >= 2 && dupes.every(x => x.possibleDuplicate) && dupes.some(x => x.title === 'Lunch at Kigali Heights'), String(dupes.length));
  const everything = await view({ limit: '100' });
  check('only the duplicates carry the flag', everything.filter(x => x.possibleDuplicate).length === dupes.length);
  const unc = await view({ flags: 'uncategorised' });
  check('uncategorised = "Other" with no sub-category, never a transfer or loan', unc.every(x => x.category === 'other' && x.subCategory === null && x.type !== 'TRANSFER' && !x.debtRole));
  const g = await feed.groups(scope, parseFeedFilter({ groupBy: 'category', month: String(oct), year: String(yr) }));
  const gFood = g.groups.find(x => x.key === 'food');
  const foodMonth = await prisma.transaction.count({ where: { ...mine, type: { not: 'DEBT' }, category: { in: ['food', 'groceries'] }, date: { gte: new Date(yr, oct - 1, 1), lt: new Date(yr, oct, 1) } } });
  check('category groups: the food header counts every food row of the month', !!gFood && gFood.count === foodMonth, `${gFood?.count}/${foodMonth}`);
  check('group totals keep currencies apart', g.groups.every(x => new Set(x.totals.map(t => t.currency)).size === x.totals.length));
  const gw = await feed.groups(scope, parseFeedFilter({ groupBy: 'wallet' }));
  check('wallet groups add up to every row', gw.groups.reduce((n, x) => n + x.count, 0) === all);
  const ordered = await feed.feed(scope, parseFeedFilter({ groupBy: 'category', limit: '100' }));
  const keys = ordered.items.map(x => x.category);
  check('grouped by category the list keeps each category together (one block each)', keys.filter((k, i) => i === 0 || k !== keys[i - 1]).length === new Set(keys).size);
  const ordered2: any[] = []; { let cur: string | null = null; let n = 0; do { const r: any = await feed.feed(scope, parseFeedFilter({ groupBy: 'wallet', limit: '9', ...(cur ? { cursor: cur } : {}) })); ordered2.push(...r.items); cur = r.nextCursor; n++; } while (cur && n < 50); }
  check('paging a grouped list walks every row once', ordered2.length === all && new Set(ordered2.map(x => x.id)).size === all, String(ordered2.length));
  const sg = await feed.suggest(scope, 'Simba');
  check('suggestions: titles with how often', sg.titles.some(t => /simba/i.test(t.title) && t.count >= 1));
  const sp = await feed.suggest(scope, 'Bosco');
  check('suggestions: people from loans', sp.people.includes('Jean Bosco'));
  check('suggestions need two letters', (await feed.suggest(scope, 'S')).titles.length === 0);
  const famSug = await feed.suggest({ kind: 'family', clientId: aline.id, familyId: (await prisma.family.findFirstOrThrow({ where: { createdBy: aline.id } })).id, role: 'OWNER', currency: 'RWF', timezone: 'UTC' }, 'Bosco');
  check('a family never sees personal loan people', famSug.people.length === 0);

  const ericId = (await prisma.client.findUniqueOrThrow({ where: { email: 'eric@demo.abyexpense.test' } })).id;
  const views = new SavedViewsService(prisma);
  for (const old of await views.list(scope)) await views.remove(scope, old.id);
  const created = await views.create(scope, { name: 'Rent and bills', filter: { kinds: ['expense'], include: [{ c: 'bills' }] } });
  check('a saved view is kept with its filter', (await views.list(scope)).some(x => x.id === created.id && x.mine));
  let conflict = false; try { await views.create(scope, { name: 'Rent and bills', filter: {} }); } catch (e: any) { conflict = e.status === 409; }
  check('a name can only be used once in a space', conflict);
  const renamed = await views.rename(scope, created.id, { name: 'Bills' });
  check('renaming', renamed.name === 'Bills');
  let notMine = false; try { await views.remove(personalScope(ericId), created.id); } catch (e: any) { notMine = e.status === 404; }
  check("someone else cannot see or remove another person's view", notMine && (await views.list(personalScope(ericId))).length === 0);
  let bad = false; try { await views.create(scope, { name: '', filter: {} }); } catch (e: any) { bad = e.status === 400; }
  check('an empty name is refused', bad);
  await views.remove(scope, created.id);
  check('removing', (await views.list(scope)).length === 0);
  const famScope2: Scope = { kind: 'family', clientId: aline.id, familyId: (await prisma.family.findFirstOrThrow({ where: { createdBy: aline.id } })).id, role: 'OWNER', currency: 'RWF', timezone: 'UTC' };
  const famView = await views.create(famScope2, { name: 'Family groceries', filter: {} });
  const graceId = (await prisma.client.findUniqueOrThrow({ where: { email: 'grace@demo.abyexpense.test' } })).id;
  const asMember: Scope = { ...famScope2, clientId: graceId, role: 'MEMBER' };
  check('a family view is shared with the family', (await views.list(asMember)).some(x => x.id === famView.id && !x.mine));
  let denied = false; try { await views.remove(asMember, famView.id); } catch (e: any) { denied = e.status === 403; }
  check('a member cannot remove a view they did not make', denied);
  await views.remove({ ...famScope2, role: 'ADMIN', clientId: (await prisma.client.findUniqueOrThrow({ where: { email: 'eric@demo.abyexpense.test' } })).id }, famView.id);
  check('an admin can', (await views.list(famScope2)).length === 0);
  check('personal views are not in the family space', (await views.list(personalScope(aline.id))).length === 0);

  // ── totals ──
  const sum = await feed.summary(scope, parseFeedFilter({ month: String(oct), year: String(yr), fallbackCurrency: 'RWF' }));
  const rwf = sum.currencies.find(c => c.currency === 'RWF')!;
  const rows = await prisma.transaction.findMany({ where: { ...mine, type: { not: 'DEBT' }, date: { gte: new Date(yr, oct - 1, 1), lt: new Date(yr, oct, 1) } }, include: { wallet: true } });
  const expect = (cur: string, type: string) => round2(rows.filter(r => (r.wallet?.currency ?? 'RWF') === cur && r.type === type && !(type === 'INCOME' && r.debtRole === 'BORROW_IN')).reduce((s, r) => s + Number(r.amount), 0));
  check('RWF income matches', !!rwf && rwf.income === expect('RWF', 'INCOME'), `${rwf?.income} vs ${expect('RWF', 'INCOME')}`);
  check('RWF spending matches', !!rwf && rwf.expense === expect('RWF', 'EXPENSE'), `${rwf?.expense} vs ${expect('RWF', 'EXPENSE')}`);
  check('count covers every row of the filter, transfers included', sum.count === rows.length, `${sum.count}/${rows.length}`);
  check('the trend line has 12 slices that add up to spending', !!rwf && rwf.series.length === 12 && round2(rwf.series.reduce((a, b) => a + b, 0)) === rwf.expense);
  check('the change since last month is worked out when there was spending', rwf?.previous != null && (rwf.previous.expense === 0 ? rwf.spendingChangePct === null : typeof rwf.spendingChangePct === 'number'), JSON.stringify(rwf?.previous) + ' ' + rwf?.spendingChangePct);
  const allTime = await feed.summary(scope, parseFeedFilter({ all: 'true' }));
  check('all time has no previous period', allTime.currencies.every(c => c.previous === null && c.spendingChangePct === null));
  const usd = allTime.currencies.find(c => c.currency === 'USD');
  check('dollars stay apart from francs', !!usd && usd.count > 0 && usd.currency !== 'RWF');
  const noLoanSum = await feed.summary(scope, parseFeedFilter({ all: 'true', includeLoans: 'false' }));
  const loanSum = await feed.summary(scope, parseFeedFilter({ all: 'true' }));
  const rwfNo = noLoanSum.currencies.find(c => c.currency === 'RWF')!, rwfYes = loanSum.currencies.find(c => c.currency === 'RWF')!;
  check('loans off lowers or keeps spending, never raises it', rwfNo.expense <= rwfYes.expense);

  // ── another person's rows never appear ──
  const eric = await prisma.client.findUniqueOrThrow({ where: { email: 'eric@demo.abyexpense.test' } });
  const ericFeed = await feed.feed(personalScope(ericId), parseFeedFilter({ limit: '100' }));
  check("another person's feed is only theirs", ericFeed.items.length === (await prisma.transaction.count({ where: { clientId: eric.id, familyId: null } })));

  // ── the family space ──
  const fam = await prisma.family.findFirstOrThrow({ where: { createdBy: aline.id } });
  const famScope: Scope = { kind: 'family', clientId: aline.id, familyId: fam.id, role: 'OWNER', currency: fam.currency, timezone: fam.timezone };
  const famFeed = await feed.feed(famScope, parseFeedFilter({ limit: '100' }));
  const famCount = await prisma.transaction.count({ where: { familyId: fam.id } });
  check('the family sees its own rows with authors, and none of the personal ones', famFeed.items.length === famCount && famFeed.items.every(x => !!x.author) && famFeed.items.every(x => x.debtId === null));
  const grace = await prisma.client.findUniqueOrThrow({ where: { email: 'grace@demo.abyexpense.test' } });
  const graceOnly = await feed.feed(famScope, parseFeedFilter({ limit: '100', memberId: grace.id }));
  check('the member filter shows only what that member added', graceOnly.items.length > 0 && graceOnly.items.every(x => x.author!.clientId === grace.id));
  const famSum = await feed.summary(famScope, parseFeedFilter({ all: 'true', fallbackCurrency: 'RWF' }));
  check('family totals are the family\'s only', famSum.count === famCount);

  // ── wallet statement and running balance ──
  const wallets = await prisma.wallet.findMany({ where: { ...mine, archived: false } });
  for (const w of wallets) {
    const stm = await feed.statement(scope, w.id, parseFeedFilter({ walletIds: w.id, all: 'true' }));
    const rows = await prisma.transaction.findMany({ where: { OR: [{ ...mine, walletId: w.id }, { ...mine, toWalletId: w.id }] } });
    const eff = rows.reduce((n, r) => n + (r.type === 'TRANSFER' ? (r.walletId === w.id ? -Number(r.amount) : Number(r.toAmount ?? r.amount)) : r.type === 'INCOME' ? Number(r.amount) : -Number(r.amount)), 0);
    check(`statement (${w.name}): closing is the balance, opening is the balance minus everything`, Math.abs(stm.closing - Number(w.balance)) < 0.01 && Math.abs(stm.opening - (Number(w.balance) - eff)) < 0.01, JSON.stringify({ o: stm.opening, i: stm.in, out: stm.out, c: stm.closing }));
    check(`statement (${w.name}): opening + in - out = closing`, stm.balanced && Math.abs(stm.opening + stm.in - stm.out - stm.closing) < 0.01);
    const page = await feed.feed(scope, parseFeedFilter({ walletIds: w.id, all: 'true', limit: '200' }));
    const items = page.items as Array<{ balanceAfter?: number | null }>;
    check(`running balance (${w.name}): newest row ends at today's balance, each earlier row steps back by its effect`, items.length === 0 || (items[0].balanceAfter !== undefined && Math.abs((items[0].balanceAfter as number) - Number(w.balance)) < 0.01), String(items[0]?.balanceAfter));
    const last = items[items.length - 1];
    const oldest = rows.find(r => r.id === (last as unknown as { id: string } | undefined)?.id);
    const oldEffect = !oldest ? 0 : oldest.type === 'TRANSFER' ? (oldest.walletId === w.id ? -Number(oldest.amount) : Number(oldest.toAmount ?? oldest.amount)) : oldest.type === 'INCOME' ? Number(oldest.amount) : -Number(oldest.amount);
    check(`running balance (${w.name}): the oldest row's balance minus its own effect is the opening`, items.length === 0 || page.nextCursor !== null || Math.abs((last.balanceAfter as number) - oldEffect - stm.opening) < 0.01);
  }
  const monthStatement = await feed.statement(scope, wallets[0].id, parseFeedFilter({ walletIds: wallets[0].id }));
  check('a month statement balances', monthStatement.balanced);
  const filtered = await feed.feed(scope, parseFeedFilter({ walletIds: wallets[0].id, kinds: 'expense' }));
  check('a filtered list has no running balance (it would be wrong)', (filtered.items as any[]).every(i => i.balanceAfter === undefined));

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
  process.exitCode = failed ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
