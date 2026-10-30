import { makeWorld } from './family.fake';
import { FamilyAllowancesService } from './family-allowances.service';

async function setup() {
  const w = makeWorld();
  const fam = await w.families.create('aline', { name: 'Uwase home' } as any).then((r: any) => r.family ?? r);
  await w.join(fam.id, 'aline', [['eric', 'MEMBER'], ['grace', 'VIEWER'], ['kevin', 'ADMIN']]);
  const svc = new FamilyAllowancesService(w.db as any, w.access);
  const owner = await w.scopeOf('aline', fam.id);
  const eric = await w.scopeOf('eric', fam.id);
  const wallet = await w.wallets.create(owner, { name: 'Home', bank: 'BK', balance: 100000, currency: 'RWF' } as any);
  const spend = (s: any, amount: number) => w.transactions.create(s, { type: 'EXPENSE', category: 'food', title: 'Food', amount, walletId: wallet.id } as any);
  return { w, fam, svc, owner, eric, spend };
}
const flush = () => new Promise(r => setTimeout(r, 30));

describe('Family allowances', () => {
  test('owners and admins set and remove an allowance; members and viewers cannot', async () => {
    const { fam, svc } = await setup();
    await svc.set('aline', fam.id, 'eric', { limit: 10000 });
    await svc.set('kevin', fam.id, 'eric', { limit: 12000 });
    await expect(svc.set('eric', fam.id, 'eric', { limit: 1 })).rejects.toThrow();
    await expect(svc.set('grace', fam.id, 'eric', { limit: 1 })).rejects.toThrow();
    await expect(svc.set('aline', fam.id, 'eric', { limit: 0 })).rejects.toThrow();
    await expect(svc.set('aline', fam.id, 'divine', { limit: 5 })).rejects.toThrow();
    const after: any = await svc.remove('aline', fam.id, 'eric');
    expect(after.items.find((i: any) => i.clientId === 'eric').limit).toBeNull();
  });

  test('a member sees what is left of their own allowance this month, and nobody else sees it', async () => {
    const { fam, svc, eric, spend } = await setup();
    await svc.set('aline', fam.id, 'eric', { limit: 10000 });
    await spend(eric, 2500);
    const mine: any = await svc.mine('eric', fam.id);
    expect([mine.limit, mine.spent, mine.left, mine.percent, mine.over]).toEqual([10000, 2500, 7500, 25, false]);
    const asEric: any = await svc.list('eric', fam.id);
    expect(asEric.canManage).toBe(false);
    expect(asEric.items.map((i: any) => i.clientId)).toEqual(['eric']);
    const asOwner: any = await svc.list('aline', fam.id);
    expect(asOwner.items.length).toBe(4);
    expect(await svc.mine('kevin', fam.id)).toBeNull();
  });

  test('loan flows and other members spending do not count', async () => {
    const { fam, svc, owner, eric, spend } = await setup();
    await svc.set('aline', fam.id, 'eric', { limit: 1000 });
    await spend(owner, 900);
    await spend(eric, 100);
    expect(((await svc.mine('eric', fam.id)) as any).spent).toBe(100);
  });

  test('the member is warned at 80% and when it is passed, and the managers hear about passing it', async () => {
    const { w, fam, svc, eric, spend } = await setup();
    await svc.set('aline', fam.id, 'eric', { limit: 1000 });
    w.notified.length = 0;
    await spend(eric, 850);
    await flush();
    expect(w.notified.filter(n => n[1] === 'Allowance almost used').map(n => n[0])).toEqual(['eric']);
    w.notified.length = 0;
    await spend(eric, 300);
    await flush();
    expect(w.notified.filter(n => n[1] === 'Allowance passed').map(n => n[0]).sort()).toEqual(['aline', 'eric', 'kevin']);
    expect(((await svc.mine('eric', fam.id)) as any).over).toBe(true);
  });

  test('a stranger cannot read or set anything', async () => {
    const { fam, svc } = await setup();
    await expect(svc.list('divine', fam.id)).rejects.toThrow();
    await expect(svc.set('divine', fam.id, 'eric', { limit: 5 })).rejects.toThrow();
  });
});
