import { makeWorld } from './family.fake';
import { ApprovalsService } from '../transaction/approvals.service';

async function setup() {
  const w = makeWorld();
  const fam = await w.families.create('aline', { name: 'Uwase home' } as any).then((r: any) => r.family ?? r);
  await w.join(fam.id, 'aline', [['eric', 'MEMBER'], ['grace', 'VIEWER'], ['kevin', 'ADMIN']]);
  const owner = await w.scopeOf('aline', fam.id);
  const eric = await w.scopeOf('eric', fam.id);
  const grace = await w.scopeOf('grace', fam.id);
  const personal = await w.scopeOf('aline');
  const home = await w.wallets.create(owner, { name: 'Home', bank: 'BK', balance: 100000, currency: 'RWF' } as any);
  const spare = await w.wallets.create(owner, { name: 'Spare', bank: 'BK', balance: 50000, currency: 'RWF' } as any);
  const mine = await w.wallets.create(personal, { name: 'Mine', bank: 'BK', balance: 40000, currency: 'RWF' } as any);
  const bal = (id: string) => Number(w.db.tables.wallet.find(x => x.id === id)!.balance);
  const add = (s: any, wallet: any, extra: Record<string, unknown> = {}) => w.transactions.create(s, { type: 'EXPENSE', category: 'food', title: 'Lunch', amount: 1000, walletId: wallet.id, ...extra } as any) as Promise<any>;
  return { w, fam, owner, eric, grace, personal, home, spare, mine, bal, add };
}

describe('editing a transaction', () => {
  test('a new amount moves the wallet by the difference only', async () => {
    const { w, owner, home, bal, add } = await setup();
    const t = await add(owner, home);
    expect(bal(home.id)).toBe(99000);
    await w.transactions.update(owner, t.id, { amount: 2500 } as any);
    expect(bal(home.id)).toBe(97500);
    await w.transactions.update(owner, t.id, { amount: 400 } as any);
    expect(bal(home.id)).toBe(99600);
  });

  test('moving it to another wallet puts the money back in the first and takes it from the second', async () => {
    const { w, owner, home, spare, bal, add } = await setup();
    const t = await add(owner, home, { amount: 3000 });
    await w.transactions.update(owner, t.id, { walletId: spare.id } as any);
    expect([bal(home.id), bal(spare.id)]).toEqual([100000, 47000]);
    await w.transactions.update(owner, t.id, { walletId: home.id, amount: 500 } as any);
    expect([bal(home.id), bal(spare.id)]).toEqual([99500, 50000]);
  });

  test('flipping expense to income in the same wallet swings the balance by twice the amount', async () => {
    const { w, owner, home, bal, add } = await setup();
    const t = await add(owner, home, { amount: 1000, category: 'food' });
    await w.transactions.update(owner, t.id, { type: 'INCOME', category: 'salary' } as any);
    expect(bal(home.id)).toBe(101000);
    await w.transactions.update(owner, t.id, { type: 'EXPENSE', category: 'food' } as any);
    expect(bal(home.id)).toBe(99000);
  });

  test('taking it off its wallet gives the money back and changes no other wallet', async () => {
    const { w, owner, home, spare, bal, add } = await setup();
    const t = await add(owner, home, { amount: 700 });
    await w.transactions.update(owner, t.id, { walletId: null } as any);
    expect([bal(home.id), bal(spare.id), w.db.tables.transaction[0].walletId]).toEqual([100000, 50000, null]);
    await w.transactions.update(owner, t.id, { walletId: spare.id } as any);       // and putting it on a wallet takes the money again
    expect(bal(spare.id)).toBe(49300);
  });

  test('changing only words leaves every balance alone, and a new category forgets the old sub-category', async () => {
    const { w, owner, home, bal, add } = await setup();
    const t = await add(owner, home, { subCategory: 'Groceries' });
    await w.transactions.update(owner, t.id, { title: 'Dinner', description: 'with family', tags: 'a, b', note: ' private ' } as any);
    expect(bal(home.id)).toBe(99000);
    expect(w.db.tables.transaction[0]).toMatchObject({ title: 'Dinner', description: 'with family', tags: '|a|b|', note: 'private', subCategory: 'Groceries' });
    await w.transactions.update(owner, t.id, { category: 'transport' } as any);
    expect(w.db.tables.transaction[0]).toMatchObject({ category: 'transport', subCategory: null });
  });

  test('nonsense is refused and changes nothing', async () => {
    const { w, owner, home, bal, add } = await setup();
    const t = await add(owner, home);
    for (const bad of [{ amount: 0 }, { amount: 'abc' }, { amount: 1e12 }, { title: '   ' }, { category: 'nope' }, { type: 'TRANSFER' }, { date: 'not a date' }, { date: new Date(Date.now() + 86_400_000).toISOString() }, { fundedByDebtId: 'x' }, { walletId: 'missing' }]) {
      await expect(w.transactions.update(owner, t.id, bad as any)).rejects.toThrow();
    }
    expect(bal(home.id)).toBe(99000);
    expect(w.db.tables.transaction[0]).toMatchObject({ title: 'Lunch', category: 'food' });
  });

  test('an archived wallet cannot receive it, and another space wallet is refused', async () => {
    const { w, owner, home, spare, mine, bal, add } = await setup();
    const t = await add(owner, home);
    w.db.tables.wallet.find(x => x.id === spare.id)!.archived = true;
    await expect(w.transactions.update(owner, t.id, { walletId: spare.id } as any)).rejects.toThrow();
    await expect(w.transactions.update(owner, t.id, { walletId: mine.id } as any)).rejects.toMatchObject({ response: { code: 'WRONG_SCOPE' } });
    expect([bal(home.id), bal(spare.id), bal(mine.id)]).toEqual([99000, 50000, 40000]);
  });

  test('a change made by someone else in between is not overwritten', async () => {
    const { w, owner, home, bal, add } = await setup();
    const t = await add(owner, home);
    const seen: any = await w.transactions.findOne(owner, t.id);
    await new Promise(r => setTimeout(r, 5));
    await w.transactions.update(owner, t.id, { amount: 2000 } as any);
    await expect(w.transactions.update(owner, t.id, { amount: 3000, expectedUpdatedAt: new Date(seen.updatedAt).toISOString() } as any)).rejects.toMatchObject({ status: 409 });
    expect(bal(home.id)).toBe(98000);
    const fresh: any = await w.transactions.findOne(owner, t.id);
    await w.transactions.update(owner, t.id, { amount: 3000, expectedUpdatedAt: new Date(fresh.updatedAt).toISOString() } as any);
    expect(bal(home.id)).toBe(97000);
  });

  test('a member edits only their own; a viewer edits nothing; findOne says what is allowed', async () => {
    const { w, owner, eric, grace, home, add } = await setup();
    const mine: any = await add(eric, home);
    const other: any = await add(owner, home);
    await w.transactions.update(eric, mine.id, { title: 'Mine' } as any);
    await expect(w.transactions.update(eric, other.id, { title: 'No' } as any)).rejects.toMatchObject({ response: { code: 'FORBIDDEN_ACTION' } });
    await expect(w.transactions.update(grace, mine.id, { title: 'No' } as any)).rejects.toThrow();
    expect(((await w.transactions.findOne(eric, other.id)) as any).edit.allowed).toBe(false);
    expect(((await w.transactions.findOne(eric, mine.id)) as any).edit.allowed).toBe(true);
    expect(((await w.transactions.findOne(owner, mine.id)) as any).edit.allowed).toBe(true);
  });

  test('a member cannot edit a small expense into one that needs approval', async () => {
    const { w, fam, eric, home, add } = await setup();
    new ApprovalsService(w.db as any, w.access, w.transactions, { notify: () => {}, nudge: () => {} } as any);
    await w.db.family.update({ where: { id: fam.id }, data: { approvalThreshold: 5000 } });
    const t: any = await add(eric, home, { amount: 4000 });
    expect(t.pending).toBeUndefined();
    await expect(w.transactions.update(eric, t.id, { amount: 9000 } as any)).rejects.toThrow(/approval/);
    await w.transactions.update(eric, t.id, { amount: 5000 } as any);       // up to the limit is fine
  });

  test('a loan entry keeps its type and category but its amount and words can change', async () => {
    const { w, owner, home, bal, add } = await setup();
    const t = await add(owner, home, { category: 'other', amount: 1000 });
    const row = w.db.tables.transaction.find(x => x.id === t.id)!;
    row.debtRole = 'REPAY_OUT'; row.category = 'loan'; row.debtId = 'd1';
    await expect(w.transactions.update(owner, t.id, { type: 'INCOME' } as any)).rejects.toThrow(/keeps its type/);
    await expect(w.transactions.update(owner, t.id, { category: 'food' } as any)).rejects.toThrow(/keeps its category/);
    await w.transactions.update(owner, t.id, { amount: 1500, title: 'Repaid Mum' } as any);
    expect([bal(home.id), row.title, row.debtId]).toEqual([98500, 'Repaid Mum', 'd1']);
  });

  test('a purchase paid from a loan changes the loan spent with its amount, and has no wallet to move', async () => {
    const { w, owner, home, add } = await setup();
    w.db.tables.debt.push({ id: 'd1', clientId: 'aline', familyId: null, kind: 'BORROWED', person: 'Bank', amount: 10000, spent: 3000, currency: 'RWF', status: 'OPEN', paid: 0, writtenOffAmount: 0, archivedAt: null });
    const t = await add(owner, home, { amount: 1 });
    const row = w.db.tables.transaction.find(x => x.id === t.id)!;
    row.walletId = null; row.fundedByDebtId = 'd1'; row.amount = 3000;
    await w.transactions.update(owner, t.id, { amount: 4000 } as any);
    expect(Number(w.db.tables.debt[0].spent)).toBe(4000);
    await expect(w.transactions.update(owner, t.id, { amount: 99999 } as any)).rejects.toThrow(/unspent/);
    await expect(w.transactions.update(owner, t.id, { walletId: home.id } as any)).rejects.toThrow(/no wallet/);
    await expect(w.transactions.update(owner, t.id, { type: 'INCOME' } as any)).rejects.toThrow();
    expect(Number(w.db.tables.debt[0].spent)).toBe(4000);
  });
});
