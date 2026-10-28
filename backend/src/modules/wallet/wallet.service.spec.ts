import { makeWorld } from '../family/family.fake';

const codeOf = async (p: Promise<unknown>) => {
  try { await p; return 'OK'; } catch (e: any) { return e?.response?.code ?? e?.message ?? 'ERR'; }
};
const body = (name: string, extra: Record<string, unknown> = {}) => ({ name, bank: 'BK', balance: 1000, currency: 'RWF', ...extra }) as any;

/** A family of Aline (owner), Eric (admin), Grace (member), Kevin (viewer); Divine is outside it. */
async function setup() {
  const w = makeWorld();
  const { family } = await w.families.create('aline', { name: 'Mwiza' });
  await w.join(family.id, 'aline', [['eric', 'ADMIN'], ['grace', 'MEMBER'], ['kevin', 'VIEWER']]);
  const fid = family.id as string;
  const personal = (who: string) => w.scopeOf(who);
  const fam = (who: string) => w.scopeOf(who, fid);
  return { w, fid, personal, fam };
}

describe('personal wallets (nothing changes for people without a family)', () => {
  test('the first wallet is the default, later ones are not', async () => {
    const { w, personal } = await setup();
    const a = await w.wallets.create(await personal('divine'), body('One'));
    const b = await w.wallets.create(await personal('divine'), body('Two'));
    expect([a.isDefault, b.isDefault]).toEqual([true, false]);
    expect(w.db.tables.wallet.every(x => x.familyId === null && x.clientId === 'divine')).toBe(true);
  });

  test('a person sees only their own wallets', async () => {
    const { w, personal } = await setup();
    await w.wallets.create(await personal('divine'), body('Divine wallet'));
    await w.wallets.create(await personal('grace'), body('Grace wallet'));
    expect((await w.wallets.findAll(await personal('divine'))).map(x => x.name)).toEqual(['Divine wallet']);
  });

  test('another person\'s wallet id is "not found", for reading, changing and deleting', async () => {
    const { w, personal } = await setup();
    const theirs = await w.wallets.create(await personal('grace'), body('Grace wallet'));
    const me = await personal('divine');
    expect(await codeOf(w.wallets.findOne(me, theirs.id))).toBe('WALLET_NOT_FOUND');
    expect(await codeOf(w.wallets.update(me, theirs.id, { name: 'Mine now' }))).toBe('WALLET_NOT_FOUND');
    expect(await codeOf(w.wallets.remove(me, theirs.id))).toBe('WALLET_NOT_FOUND');
    expect(w.db.tables.wallet[0].name).toBe('Grace wallet');
  });

  test('an update only changes the allowed fields: a request that names clientId or familyId cannot move the wallet', async () => {
    const { w, personal, fid } = await setup();
    const mine = await w.wallets.create(await personal('grace'), body('Mine'));
    await w.wallets.update(await personal('grace'), mine.id, { name: 'Renamed', balance: 5, clientId: 'divine', familyId: fid, id: 'other' } as any);
    const row = w.db.tables.wallet[0];
    expect(row).toMatchObject({ name: 'Renamed', balance: 5, clientId: 'grace', familyId: null, id: mine.id });
  });

  test('deleting a personal wallet that has transactions still works, as before', async () => {
    const { w, personal } = await setup();
    const mine = await w.wallets.create(await personal('grace'), body('Mine'));
    w.db.tables.transaction.push({ id: 't1', clientId: 'grace', familyId: null, walletId: mine.id, type: 'EXPENSE', amount: 5, date: new Date() });
    expect(await w.wallets.remove(await personal('grace'), mine.id)).toEqual({ success: true });
  });
});

describe('family wallets', () => {
  test('only the Owner and Admins create them; the first one is the family default (apart from personal ones)', async () => {
    const { w, fam, personal } = await setup();
    await w.wallets.create(await personal('eric'), body('Eric personal'));                 // a personal default already exists
    expect(await codeOf(w.wallets.create(await fam('grace'), body('Nope')))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.wallets.create(await fam('kevin'), body('Nope')))).toBe('FORBIDDEN_ACTION');
    const first = await w.wallets.create(await fam('eric'), body('Household'));
    const second = await w.wallets.create(await fam('aline'), body('School'));
    expect([first.isDefault, second.isDefault]).toEqual([true, false]);
    expect(w.db.tables.wallet.find(x => x.name === 'Household')).toMatchObject({ familyId: expect.any(String), clientId: 'eric' });
  });

  test('personal and family wallets never appear in each other\'s lists', async () => {
    const { w, fam, personal } = await setup();
    await w.wallets.create(await personal('grace'), body('Grace personal'));
    await w.wallets.create(await fam('aline'), body('Household'));
    expect((await w.wallets.findAll(await personal('grace'))).map(x => x.name)).toEqual(['Grace personal']);
    expect((await w.wallets.findAll(await fam('grace'))).map(x => x.name)).toEqual(['Household']);
    expect((await w.wallets.findAll(await personal('aline'))).map(x => x.name)).toEqual([]);            // the owner's personal list stays empty
  });

  test('a family wallet is not reachable from Personal, or by someone outside the family, even by id', async () => {
    const { w, fam, personal } = await setup();
    const house = await w.wallets.create(await fam('aline'), body('Household'));
    expect(await codeOf(w.wallets.findOne(await personal('aline'), house.id))).toBe('WALLET_NOT_FOUND');
    expect(await codeOf(w.wallets.findOne(await personal('divine'), house.id))).toBe('WALLET_NOT_FOUND');
    expect(await codeOf(w.scopeOf('divine', (await w.families.mine('aline'))!.family.id))).toBe('NOT_A_MEMBER');
  });

  test('account details are shown to the Owner and Admins only', async () => {
    const { w, fam, personal } = await setup();
    const house = await w.wallets.create(await fam('aline'), body('Household', { accountNumber: '1234 5678 9012', accountHolder: 'Aline U' }));
    for (const who of ['aline', 'eric']) expect(await w.wallets.findOne(await fam(who), house.id)).toMatchObject({ accountNumber: '123456789012', accountHolder: 'Aline U', last4: '9012' });
    for (const who of ['grace', 'kevin']) {
      expect(await w.wallets.findOne(await fam(who), house.id)).toMatchObject({ name: 'Household', balance: 1000, accountNumber: null, accountHolder: null, last4: null });
      expect((await w.wallets.findAll(await fam(who)))[0]).toMatchObject({ accountNumber: null, last4: null });
    }
    const mine = await w.wallets.create(await personal('grace'), body('Mine', { accountNumber: '5555' }));
    expect(mine.accountNumber).toBe('5555');                                                              // her own personal wallet is not masked
  });

  test('changing a family wallet needs the Owner or an Admin', async () => {
    const { w, fam } = await setup();
    const house = await w.wallets.create(await fam('aline'), body('Household'));
    expect(await codeOf(w.wallets.update(await fam('grace'), house.id, { name: 'X' }))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.wallets.update(await fam('kevin'), house.id, { name: 'X' }))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.wallets.update(await fam('eric'), house.id, { name: 'Home' }))).toBe('OK');
  });

  test('only the Owner deletes a family wallet, and only one that was never used', async () => {
    const { w, fam, fid } = await setup();
    const used = await w.wallets.create(await fam('aline'), body('Used'));
    const spare = await w.wallets.create(await fam('aline'), body('Spare'));
    w.db.tables.transaction.push({ id: 't1', clientId: 'grace', familyId: fid, walletId: used.id, type: 'EXPENSE', amount: 5, date: new Date() });
    expect(await codeOf(w.wallets.remove(await fam('eric'), spare.id))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.wallets.remove(await fam('aline'), used.id))).toBe('WALLET_HAS_HISTORY');
    expect(await codeOf(w.wallets.remove(await fam('aline'), spare.id))).toBe('OK');
    expect(w.db.tables.wallet.map(x => x.name)).toEqual(['Used']);
  });

  test('totals and net worth count only the scope asked for', async () => {
    const { w, fam, personal } = await setup();
    await w.wallets.create(await personal('grace'), body('Mine', { balance: 70 }));
    await w.wallets.create(await fam('aline'), body('Household', { balance: 1000 }));
    await w.wallets.create(await fam('aline'), body('School', { balance: 500 }));
    expect(await w.wallets.summary(await personal('grace'))).toEqual({ totalBalance: 70, walletCount: 1 });
    expect(await w.wallets.summary(await fam('grace'))).toEqual({ totalBalance: 1500, walletCount: 2 });
    expect((await w.wallets.overview(await fam('kevin'), 'RWF')).total).toBe(1500);
    expect((await w.wallets.overview(await personal('kevin'), 'RWF')).total).toBe(0);
  });
});

describe('transfers', () => {
  test('inside a family a Member may move money between family wallets; the row belongs to the family and its author', async () => {
    const { w, fam, fid } = await setup();
    const a = await w.wallets.create(await fam('aline'), body('A', { balance: 1000 }));
    const b = await w.wallets.create(await fam('aline'), body('B', { balance: 0 }));
    await w.wallets.transfer(await fam('grace'), { fromWalletId: a.id, toWalletId: b.id, amount: 300 });
    expect(w.db.tables.wallet.map(x => [x.name, x.balance])).toEqual([['A', 700], ['B', 300]]);
    expect(w.db.tables.transaction[0]).toMatchObject({ type: 'TRANSFER', familyId: fid, clientId: 'grace' });
  });
  test('a Viewer cannot transfer', async () => {
    const { w, fam } = await setup();
    const a = await w.wallets.create(await fam('aline'), body('A'));
    const b = await w.wallets.create(await fam('aline'), body('B'));
    expect(await codeOf(w.wallets.transfer(await fam('kevin'), { fromWalletId: a.id, toWalletId: b.id, amount: 1 }))).toBe('FORBIDDEN_ACTION');
  });
  test('Personal and Family money cannot be mixed in either direction, and nothing moves', async () => {
    const { w, fam, personal } = await setup();
    const fw = await w.wallets.create(await fam('aline'), body('Family', { balance: 1000 }));
    const pw = await w.wallets.create(await personal('aline'), body('Personal', { balance: 1000 }));
    expect(await codeOf(w.wallets.transfer(await fam('aline'), { fromWalletId: fw.id, toWalletId: pw.id, amount: 10 }))).toBe('WRONG_SCOPE');
    expect(await codeOf(w.wallets.transfer(await personal('aline'), { fromWalletId: pw.id, toWalletId: fw.id, amount: 10 }))).toBe('WALLET_NOT_FOUND');
    expect(await codeOf(w.wallets.quote(await fam('aline'), fw.id, pw.id, 10))).toBe('WRONG_SCOPE');
    expect(w.db.tables.wallet.map(x => x.balance)).toEqual([1000, 1000]);
    expect(w.db.tables.transaction).toHaveLength(0);
  });
  test('a personal transfer still works and stays personal', async () => {
    const { w, personal } = await setup();
    const a = await w.wallets.create(await personal('grace'), body('A', { balance: 100 }));
    const b = await w.wallets.create(await personal('grace'), body('B', { balance: 0 }));
    await w.wallets.transfer(await personal('grace'), { fromWalletId: a.id, toWalletId: b.id, amount: 40 });
    expect(w.db.tables.transaction[0]).toMatchObject({ familyId: null, clientId: 'grace' });
  });
});

describe('what the screens read from transactions', () => {
  test('activity and the daily flow show only the scope asked for', async () => {
    const { w, fam, personal, fid } = await setup();
    const pw = await w.wallets.create(await personal('grace'), body('Mine'));
    const fw = await w.wallets.create(await fam('aline'), body('Family'));
    const now = new Date();
    w.db.tables.transaction.push(
      { id: 'p', clientId: 'grace', familyId: null, walletId: pw.id, type: 'EXPENSE', category: 'food', title: 'Mine', amount: 10, date: now },
      { id: 'f', clientId: 'grace', familyId: fid, walletId: fw.id, type: 'EXPENSE', category: 'food', title: 'Shared', amount: 20, date: now },
    );
    expect((await w.wallets.activity(await personal('grace'), 20)).map(t => t.title)).toEqual(['Mine']);
    expect((await w.wallets.activity(await fam('grace'), 20)).map(t => t.title)).toEqual(['Shared']);
    expect((await w.wallets.dailyFlow(await personal('grace'), 'RWF', 7)).totalOut).toBe(10);
    expect((await w.wallets.dailyFlow(await fam('grace'), 'RWF', 7)).totalOut).toBe(20);
  });
});
