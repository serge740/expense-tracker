import { makeWorld } from './family.fake';

const wallet = { name: 'Home', bank: 'BK', balance: 100000, currency: 'RWF' } as any;
const spend = (walletId: string, amount: number, title = 'Rice') => ({ type: 'EXPENSE', category: 'food', title, amount, walletId }) as any;

async function family() {
  const w = makeWorld();
  const fam = await w.families.create('aline', { name: 'Uwase home' } as any).then((r: any) => r.family ?? r);
  await w.join(fam.id, 'aline', [['eric', 'MEMBER'], ['grace', 'MEMBER']]);
  const owner = await w.scopeOf('aline', fam.id);
  const hw = await w.wallets.create(owner, wallet);
  w.notified.length = 0;
  return { w, fam, owner, hw };
}
const flush = () => new Promise(r => setTimeout(r, 20));

describe('Family fan-out', () => {
  test('the other members hear about a family expense and are nudged; the author is not told about their own', async () => {
    const { w, owner, hw } = await family();
    await w.transactions.create(owner, spend(hw.id, 2500));
    await flush();
    const told = w.notified.map(n => n[0]).sort();
    expect(told).toEqual(['eric', 'grace']);
    expect(String(w.notified[0][2])).toContain('Aline');
    expect(w.nudged.map(n => n[0]).sort()).toEqual(['eric', 'grace']);
  });

  test('a member who switched family notifications off is nudged but not messaged', async () => {
    const { w, owner, hw } = await family();
    w.db.tables.notificationPreference.push({ id: 'p1', clientId: 'eric', notifyFamily: false });
    await w.transactions.create(owner, spend(hw.id, 100));
    await flush();
    expect(w.notified.map(n => n[0])).toEqual(['grace']);
    expect(w.nudged.map(n => n[0]).sort()).toEqual(['eric', 'grace']);
  });

  test('crossing 80% of the family budget tells every member once', async () => {
    const { w, owner, hw } = await family();
    await w.budgets.upsert(owner, { limit: 10000 } as any);
    await w.transactions.create(owner, spend(hw.id, 7000));
    await flush();
    w.notified.length = 0;
    await w.transactions.create(owner, spend(hw.id, 1500, 'More rice'));
    await flush();
    const alerts = w.notified.filter(n => String(n[1]).includes('Family budget'));
    expect(alerts.map(n => n[0]).sort()).toEqual(['aline', 'eric', 'grace']);
    w.notified.length = 0;
    await w.transactions.create(owner, spend(hw.id, 100, 'Salt'));
    await flush();
    expect(w.notified.filter(n => String(n[1]).includes('Family budget'))).toHaveLength(0);
  });

  test('a personal expense tells no one', async () => {
    const { w } = await family();
    const me = await w.scopeOf('aline');
    const pw = await w.wallets.create(me, wallet);
    w.notified.length = 0;
    await w.transactions.create(me, spend(pw.id, 100));
    await flush();
    expect(w.nudged).toHaveLength(0);
  });
});

import { ReportsService } from '../reports/reports.service';

describe('Spending by member', () => {
  test('lists each member who added something, with names and shares, never contact details', async () => {
    const { w, fam, owner, hw } = await family();
    const eric = await w.scopeOf('eric', fam.id);
    await w.transactions.create(owner, spend(hw.id, 3000, 'Rice'));
    await w.transactions.create(eric, spend(hw.id, 1000, 'Beans'));
    await w.transactions.create(eric, { type: 'INCOME', category: 'salary', title: 'Pay', amount: 5000, walletId: hw.id } as any);
    const now = new Date();
    const rows = await new ReportsService(w.db as any).byMember(owner, now.getMonth() + 1, now.getFullYear());
    expect(rows.map(r => [r.name, r.spent, r.earned, r.share, r.isYou])).toEqual([['Aline Uwase', 3000, 0, 75, true], ['Eric Uwase', 1000, 5000, 25, false]]);
    expect(JSON.stringify(rows)).not.toMatch(/@|\+250/);
  });

  test('in Personal it is only you', async () => {
    const { w } = await family();
    const me = await w.scopeOf('aline');
    const pw = await w.wallets.create(me, wallet);
    await w.transactions.create(me, spend(pw.id, 400));
    const now = new Date();
    const rows = await new ReportsService(w.db as any).byMember(me, now.getMonth() + 1, now.getFullYear());
    expect(rows).toHaveLength(1);
    expect(rows[0].spent).toBe(400);
  });
});

describe('Archived families', () => {
  test('are removed for good only after 30 days, with their members', async () => {
    const { w, fam } = await family();
    await w.families.archive('aline', fam.id, 'Uwase home');
    expect(await w.families.purgeArchived(new Date(Date.now() + 29 * 86_400_000))).toBe(0);
    expect(w.db.tables.family).toHaveLength(1);
    expect(await w.families.purgeArchived(new Date(Date.now() + 31 * 86_400_000))).toBe(1);
    expect(w.db.tables.family).toHaveLength(0);
  });
  test('an active family is never purged', async () => {
    const { w } = await family();
    expect(await w.families.purgeArchived(new Date(Date.now() + 400 * 86_400_000))).toBe(0);
  });
});
