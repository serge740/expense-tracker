import { makeWorld } from '../family/family.fake';

const codeOf = async (p: Promise<unknown>) => {
  try { await p; return 'OK'; } catch (e: any) { return e?.response?.code ?? e?.message ?? 'ERR'; }
};

async function setup() {
  const w = makeWorld();
  const { family } = await w.families.create('aline', { name: 'Mwiza' });
  await w.join(family.id, 'aline', [['eric', 'ADMIN'], ['grace', 'MEMBER'], ['kevin', 'VIEWER']]);
  const fid = family.id as string;
  return { w, fid, personal: (p: string) => w.scopeOf(p), fam: (p: string) => w.scopeOf(p, fid) };
}

describe('budgets by scope', () => {
  test('a person keeps their own budget, with nothing changed for them', async () => {
    const { w, personal } = await setup();
    expect(await w.budgets.getCurrent(await personal('divine'))).toMatchObject({ limit: 0, spent: 0, percentage: 0 });
    await w.budgets.upsert(await personal('divine'), { limit: 500 });
    expect((await w.budgets.getCurrent(await personal('divine'))).limit).toBe(500);
    expect(w.db.tables.budget[0]).toMatchObject({ clientId: 'divine', familyId: null, scopeKey: 'p:divine' });
  });

  test('setting the budget twice for a month updates it instead of adding another', async () => {
    const { w, personal } = await setup();
    await w.budgets.upsert(await personal('divine'), { limit: 500 });
    await w.budgets.upsert(await personal('divine'), { limit: 800 });
    expect(w.db.tables.budget).toHaveLength(1);
    expect((await w.budgets.getCurrent(await personal('divine'))).limit).toBe(800);
  });

  test('a member has a personal budget and a family budget for the same month, and they never mix', async () => {
    const { w, personal, fam, fid } = await setup();
    await w.budgets.upsert(await personal('eric'), { limit: 100 });
    await w.budgets.upsert(await fam('eric'), { limit: 9000 });                      // the same person, the same month
    expect(w.db.tables.budget.map(b => [b.scopeKey, b.familyId, Number(b.limit)]).sort()).toEqual([[`f:${fid}`, fid, 9000], ['p:eric', null, 100]]);
    expect((await w.budgets.getCurrent(await personal('eric'))).limit).toBe(100);
    expect((await w.budgets.getCurrent(await fam('grace'))).limit).toBe(9000);
  });

  test('only the Owner and Admins set the family budget; every member can read it', async () => {
    const { w, fam } = await setup();
    expect(await codeOf(w.budgets.upsert(await fam('grace'), { limit: 1 }))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.budgets.upsert(await fam('kevin'), { limit: 1 }))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.budgets.upsert(await fam('eric'), { limit: 5000 }))).toBe('OK');
    expect(await codeOf(w.budgets.upsert(await fam('aline'), { limit: 6000 }))).toBe('OK');
    for (const p of ['grace', 'kevin']) expect((await w.budgets.getCurrent(await fam(p))).limit).toBe(6000);
  });

  test('spending counts only inside its own scope', async () => {
    const { w, personal, fam, fid } = await setup();
    const house = await w.wallets.create(await fam('aline'), { name: 'House', bank: 'B', balance: 100000 } as any);
    const mine = await w.wallets.create(await personal('grace'), { name: 'Mine', bank: 'B', balance: 100000 } as any);
    await w.budgets.upsert(await fam('aline'), { limit: 1000 });
    await w.budgets.upsert(await personal('grace'), { limit: 1000 });
    await w.transactions.create(await fam('grace'), { type: 'EXPENSE', category: 'food', title: 'Shared', amount: 400, walletId: house.id } as any);
    await w.transactions.create(await personal('grace'), { type: 'EXPENSE', category: 'food', title: 'Private', amount: 100, walletId: mine.id } as any);
    expect(await w.budgets.getCurrent(await fam('kevin'))).toMatchObject({ spent: 400, remaining: 600, percentage: 40 });
    expect(await w.budgets.getCurrent(await personal('grace'))).toMatchObject({ spent: 100, remaining: 900, percentage: 10 });
    expect(fid).toBeTruthy();
  });

  test('a bad limit is refused', async () => {
    const { w, personal } = await setup();
    for (const limit of [NaN, -1, 'abc' as any, undefined as any]) expect(await codeOf(w.budgets.upsert(await personal('divine'), { limit }))).toBe('INVALID_INPUT');
  });
});
