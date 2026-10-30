import { makeWorld } from '../family/family.fake';

const codeOf = async (p: Promise<unknown>) => {
  try { await p; return 'OK'; } catch (e: any) { return e?.response?.code ?? e?.message ?? 'ERR'; }
};
const wallet = (name: string, balance = 1000) => ({ name, bank: 'BK', balance, currency: 'RWF' }) as any;
const spend = (walletId: string, amount: number, title = 'Lunch') => ({ type: 'EXPENSE', category: 'food', title, amount, walletId }) as any;

/** Aline owns the family, Eric is an Admin, Grace a Member, Kevin a Viewer; Divine is outside. Each has a personal wallet too. */
async function setup() {
  const w = makeWorld();
  const { family } = await w.families.create('aline', { name: 'Mwiza' });
  await w.join(family.id, 'aline', [['eric', 'ADMIN'], ['grace', 'MEMBER'], ['kevin', 'VIEWER']]);
  const fid = family.id as string;
  const personal = (who: string) => w.scopeOf(who);
  const fam = (who: string) => w.scopeOf(who, fid);
  const house = await w.wallets.create(await fam('aline'), wallet('Household', 10000));
  const mine: Record<string, { id: string }> = {};
  for (const p of ['aline', 'eric', 'grace', 'kevin', 'divine']) mine[p] = await w.wallets.create(await personal(p), wallet(`${p} personal`, 500));
  const balance = (id: string) => w.db.tables.wallet.find(x => x.id === id)!.balance;
  return { w, fid, personal, fam, house, mine, balance };
}

describe('personal transactions (nothing changes for people without a family)', () => {
  test('an expense is stored as personal, moves the wallet, and keeps its old shape (no author)', async () => {
    const { w, personal, mine, balance } = await setup();
    const res: any = await w.transactions.create(await personal('grace'), spend(mine.grace.id, 40));
    expect(res).toMatchObject({ type: 'EXPENSE', title: 'Lunch', amount: -40, walletId: mine.grace.id });
    expect(res).not.toHaveProperty('author');
    expect(w.db.tables.transaction[0]).toMatchObject({ clientId: 'grace', familyId: null });
    expect(balance(mine.grace.id)).toBe(460);
  });

  test('income adds, and deleting reverses exactly', async () => {
    const { w, personal, mine, balance } = await setup();
    const inc: any = await w.transactions.create(await personal('grace'), { type: 'INCOME', category: 'salary', title: 'Pay', amount: 100, walletId: mine.grace.id } as any);
    expect(balance(mine.grace.id)).toBe(600);
    await w.transactions.remove(await personal('grace'), inc.id);
    expect(balance(mine.grace.id)).toBe(500);
    expect(w.db.tables.transaction).toHaveLength(0);
  });

  test('a person cannot add a transaction to somebody else\'s wallet (the old hole)', async () => {
    const { w, personal, mine, balance } = await setup();
    expect(await codeOf(w.transactions.create(await personal('divine'), spend(mine.grace.id, 999)))).toBe('WALLET_NOT_FOUND');
    expect(balance(mine.grace.id)).toBe(500);
    expect(w.db.tables.transaction).toHaveLength(0);
  });

  test('a family wallet is not usable from Personal, even by its own members', async () => {
    const { w, personal, house, balance } = await setup();
    expect(await codeOf(w.transactions.create(await personal('grace'), spend(house.id, 50)))).toBe('WALLET_NOT_FOUND');
    expect(balance(house.id)).toBe(10000);
  });

  test('an edit cannot move the transaction to another person\'s wallet, or change who owns it', async () => {
    const { w, personal, mine, balance } = await setup();
    const t: any = await w.transactions.create(await personal('grace'), spend(mine.grace.id, 40));
    expect(await codeOf(w.transactions.update(await personal('grace'), t.id, { walletId: mine.divine.id }))).toBe('WALLET_NOT_FOUND');
    expect([balance(mine.grace.id), balance(mine.divine.id)]).toEqual([460, 500]);
    await w.transactions.update(await personal('grace'), t.id, { title: 'Dinner', amount: 60, clientId: 'divine', familyId: 'x', debtId: 'd' } as any);
    expect(w.db.tables.transaction[0]).toMatchObject({ title: 'Dinner', clientId: 'grace', familyId: null, debtId: null });
    expect(balance(mine.grace.id)).toBe(440);
  });

  test('other people\'s transactions are "not found" for editing and deleting', async () => {
    const { w, personal, mine } = await setup();
    const t: any = await w.transactions.create(await personal('grace'), spend(mine.grace.id, 40));
    expect(await codeOf(w.transactions.update(await personal('divine'), t.id, { title: 'x' }))).toBe('Transaction not found');
    expect(await codeOf(w.transactions.remove(await personal('divine'), t.id))).toBe('Transaction not found');
  });

  test('a push is sent for a personal transaction', async () => {
    const { w, personal, mine } = await setup();
    await w.transactions.create(await personal('grace'), spend(mine.grace.id, 40));
    await new Promise(r => setTimeout(r, 20));
    expect(w.notified.length).toBeGreaterThan(0);
  });
});

describe('family transactions', () => {
  test('a Member adds one: the family owns it, the Member is its author, the family wallet moves', async () => {
    const { w, fam, fid, house, balance } = await setup();
    const res: any = await w.transactions.create(await fam('grace'), spend(house.id, 300, 'Groceries'));
    expect(res.author).toEqual({ clientId: 'grace', name: 'Grace Uwase', isYou: true });
    expect(w.db.tables.transaction[0]).toMatchObject({ clientId: 'grace', familyId: fid, walletId: house.id });
    expect(balance(house.id)).toBe(9700);
  });

  test('a Viewer cannot add; Owner, Admin and Member can', async () => {
    const { w, fam, house } = await setup();
    expect(await codeOf(w.transactions.create(await fam('kevin'), spend(house.id, 1)))).toBe('FORBIDDEN_ACTION');
    for (const p of ['aline', 'eric', 'grace']) expect(await codeOf(w.transactions.create(await fam(p), spend(house.id, 1)))).toBe('OK');
  });

  test('a personal wallet cannot be used in a family request, and nothing moves', async () => {
    const { w, fam, mine, balance } = await setup();
    expect(await codeOf(w.transactions.create(await fam('grace'), spend(mine.grace.id, 50)))).toBe('WRONG_SCOPE');
    expect(balance(mine.grace.id)).toBe(500);
    expect(w.db.tables.transaction).toHaveLength(0);
  });

  test('another person\'s wallet, or a made-up one, is simply not found', async () => {
    const { w, fam, mine } = await setup();
    expect(await codeOf(w.transactions.create(await fam('grace'), spend(mine.divine.id, 50)))).toBe('WALLET_NOT_FOUND');
    expect(await codeOf(w.transactions.create(await fam('grace'), spend('no-such-wallet', 50)))).toBe('WALLET_NOT_FOUND');
  });

  test('paying from borrowed money is personal only', async () => {
    const { w, fam, house } = await setup();
    expect(await codeOf(w.transactions.create(await fam('grace'), { ...spend(house.id, 5), fundedByDebtId: 'd1' }))).toBe('PERSONAL_ONLY');
  });

  test('a Member edits and deletes their own, not other people\'s; an Admin and the Owner can; a Viewer cannot', async () => {
    const { w, fam, house, balance } = await setup();
    const graces: any = await w.transactions.create(await fam('grace'), spend(house.id, 100, 'Grace buys'));
    const erics: any = await w.transactions.create(await fam('eric'), spend(house.id, 200, 'Eric buys'));
    expect(await codeOf(w.transactions.update(await fam('grace'), graces.id, { amount: 150 }))).toBe('OK');
    expect(await codeOf(w.transactions.update(await fam('grace'), erics.id, { amount: 1 }))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.transactions.remove(await fam('grace'), erics.id))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.transactions.update(await fam('kevin'), graces.id, { amount: 1 }))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.transactions.remove(await fam('kevin'), graces.id))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.transactions.update(await fam('eric'), graces.id, { amount: 120 }))).toBe('OK');
    expect(await codeOf(w.transactions.remove(await fam('aline'), erics.id))).toBe('OK');
    expect(balance(house.id)).toBe(10000 - 120);
  });

  test('an edit in a family cannot move the row out of the family', async () => {
    const { w, fam, house, mine, fid } = await setup();
    const t: any = await w.transactions.create(await fam('grace'), spend(house.id, 100));
    expect(await codeOf(w.transactions.update(await fam('grace'), t.id, { walletId: mine.grace.id }))).toBe('WRONG_SCOPE');
    await w.transactions.update(await fam('grace'), t.id, { title: 'x', familyId: null, clientId: 'divine' } as any);
    expect(w.db.tables.transaction[0]).toMatchObject({ familyId: fid, clientId: 'grace' });
  });

  test('the family list shows everyone\'s entries with their authors, newest first, and never personal ones', async () => {
    const { w, fam, personal, house, mine } = await setup();
    await w.transactions.create(await fam('grace'), spend(house.id, 10, 'Grace item'));
    await w.transactions.create(await fam('eric'), spend(house.id, 20, 'Eric item'));
    await w.transactions.create(await personal('grace'), spend(mine.grace.id, 30, 'Grace private'));
    const list: any = await w.transactions.findAll(await fam('kevin'), { limit: 50 } as any);
    expect(list.data.map((t: any) => [t.title, t.author.name, t.author.isYou]).sort()).toEqual([['Eric item', 'Eric Uwase', false], ['Grace item', 'Grace Uwase', false]]);
    const asGrace: any = await w.transactions.findAll(await fam('grace'), { limit: 50 } as any);
    expect(asGrace.data.map((t: any) => [t.title, t.author.isYou]).sort()).toEqual([['Eric item', false], ['Grace item', true]]);       // "you" is whoever is asking
    expect(list.total).toBe(2);
    const mineOnly: any = await w.transactions.findAll(await personal('grace'), { limit: 50 } as any);
    expect(mineOnly.data.map((t: any) => t.title)).toEqual(['Grace private']);
    expect(mineOnly.data[0]).not.toHaveProperty('author');
  });

  test('"only what Grace added" filters by member, and the other views follow the same scope', async () => {
    const { w, fam, personal, house, mine } = await setup();
    await w.transactions.create(await fam('grace'), spend(house.id, 10, 'Grace item'));
    await w.transactions.create(await fam('eric'), spend(house.id, 20, 'Eric item'));
    await w.transactions.create(await personal('eric'), spend(mine.eric.id, 5, 'Eric private'));
    const onlyGrace: any = await w.transactions.findAll(await fam('aline'), { memberId: 'grace', limit: 50 } as any);
    expect(onlyGrace.data.map((t: any) => t.title)).toEqual(['Grace item']);
    expect((await w.transactions.findRecent(await fam('aline'), 10)).map((t: any) => t.title).sort()).toEqual(['Eric item', 'Grace item']);
    const groups: any = await w.transactions.history(await fam('aline'), {} as any);
    expect(groups.flatMap((g: any) => g.items.map((i: any) => i.title)).sort()).toEqual(['Eric item', 'Grace item']);
    const mineGroups: any = await w.transactions.history(await personal('eric'), {} as any);
    expect(mineGroups.flatMap((g: any) => g.items.map((i: any) => i.title))).toEqual(['Eric private']);
  });

  test('a former member\'s entries stay, labelled "Former member"', async () => {
    const { w, fam, house } = await setup();
    await w.transactions.create(await fam('grace'), spend(house.id, 10, 'Grace item'));
    await w.families.removeMember('aline', (await w.families.mine('aline'))!.family.id, 'grace');
    const list: any = await w.transactions.findAll(await fam('aline'), { limit: 50 } as any);
    expect(list.data[0]).toMatchObject({ title: 'Grace item', author: { clientId: 'grace' } });
    w.db.tables.client.splice(w.db.tables.client.findIndex(c => c.id === 'grace'), 1);
    expect(((await w.transactions.findAll(await fam('aline'), { limit: 50 } as any)) as any).data[0].author.name).toBe('Former member');
  });

  test('the author of a family transaction gets no push of their own; the others are told', async () => {
    const { w, fam, house } = await setup();
    await w.transactions.create(await fam('grace'), spend(house.id, 10));
    await new Promise(r => setTimeout(r, 20));
    expect(w.notified.map(n => n[0])).not.toContain('grace');
    expect(w.notified.length).toBeGreaterThan(0);
  });

  test('five members spending at once leave the right balance', async () => {
    const { w, fam, house, balance } = await setup();
    const scopes = await Promise.all([fam('aline'), fam('eric'), fam('grace')]);
    const before = balance(house.id);
    await Promise.all(Array.from({ length: 6 }, (_, i) => w.transactions.create(scopes[i % 3], spend(house.id, 10))));
    expect(balance(house.id)).toBe(before - 60);
  });
});

describe('the budget alert only looks at personal money', () => {
  test('a family expense never counts towards, or triggers, a personal budget', async () => {
    const { w, fam, personal, house, mine } = await setup();
    await w.budgets.upsert(await personal('grace'), { limit: 100 });
    await w.transactions.create(await fam('grace'), spend(house.id, 500));
    await new Promise(r => setTimeout(r, 20));
    expect(w.notified.some(n => String(n[1]).includes('Budget'))).toBe(false);
    expect((await w.budgets.getCurrent(await personal('grace'))).spent).toBe(0);
    await w.transactions.create(await personal('grace'), spend(mine.grace.id, 90));
    await new Promise(r => setTimeout(r, 20));
    expect(w.notified.some(n => String(n[1]).includes('Budget almost used'))).toBe(true);
  });
});
