import { makeWorld } from './family.fake';

async function setup() {
  const w = makeWorld();
  const a = (await w.families.create('aline', { name: 'Home' })).family.id;
  const b = (await w.families.create('kevin', { name: 'Office' })).family.id;
  await w.join(a, 'aline', [['eric', 'MEMBER']]);
  await w.join(b, 'kevin', [['eric', 'ADMIN']]);
  return { w, a, b };
}

describe('Being in several families', () => {
  test('each header resolves to that family with the right role, and an unrelated family is refused', async () => {
    const { w, a, b } = await setup();
    const inA = await w.scopeOf('eric', a);
    const inB = await w.scopeOf('eric', b);
    expect([inA.kind, (inA as any).role, (inB as any).role]).toEqual(['family', 'MEMBER', 'ADMIN']);
    const c = (await w.families.create('divine', { name: 'Stranger' })).family.id;
    await expect(w.scopeOf('eric', c)).rejects.toThrow();
  });

  test('money in one family is never seen from the other, or from Personal', async () => {
    const { w, a, b } = await setup();
    const inA = await w.scopeOf('eric', a);
    const inB = await w.scopeOf('eric', b);
    const personal = await w.scopeOf('eric');
    const wa = await w.wallets.create(await w.scopeOf('aline', a), { name: 'Home cash', bank: 'BK', balance: 100, currency: 'RWF' } as any);
    await w.wallets.create(inB, { name: 'Office cash', bank: 'BK', balance: 5, currency: 'RWF' } as any).catch(() => null);
    const namesIn = async (s: any) => ((await w.wallets.findAll(s)) as any[]).map(x => x.name);
    expect(await namesIn(inA)).toEqual(['Home cash']);
    expect((await namesIn(inB)).includes('Home cash')).toBe(false);
    expect((await namesIn(personal)).includes('Home cash')).toBe(false);
    await expect(w.transactions.create(inB, { type: 'EXPENSE', category: 'food', title: 'x', amount: 1, walletId: wa.id } as any)).rejects.toThrow();
  });

  test('leaving one family keeps the other', async () => {
    const { w, a, b } = await setup();
    await w.families.removeMember('eric', a, 'eric');
    const mine: any = await w.families.mine('eric');
    expect(mine.families.map((f: any) => f.family.id)).toEqual([b]);
    await expect(w.scopeOf('eric', a)).rejects.toThrow();
    expect(((await w.scopeOf('eric', b)) as any).role).toBe('ADMIN');
  });

  test('the same person cannot join the same family twice', async () => {
    const { w, a } = await setup();
    const inv = await w.invites.create('aline', a, { role: 'MEMBER' });
    await expect(w.invites.accept('eric', { code: inv.code })).rejects.toThrow();
  });
});
