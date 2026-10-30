import { makeWorld } from './family.fake';
import { DebtsService } from '../debts/debts.service';

async function setup() {
  const w = makeWorld();
  const fam = await w.families.create('aline', { name: 'Uwase home' } as any).then((r: any) => r.family ?? r);
  await w.join(fam.id, 'aline', [['eric', 'MEMBER'], ['grace', 'VIEWER'], ['kevin', 'ADMIN']]);
  const reminders = { syncDebtSafe: async () => {}, onTick: () => {} };
  const plans = { reconcile: async () => {} };
  const svc = new DebtsService(w.db as any, { notify: (...a: unknown[]) => { w.notified.push(a); } } as any, reminders as any, plans as any);
  const owner = await w.scopeOf('aline', fam.id);
  const kevin = await w.scopeOf('kevin', fam.id);
  const eric = await w.scopeOf('eric', fam.id);
  const grace = await w.scopeOf('grace', fam.id);
  const personal = await w.scopeOf('aline');
  const home = await w.wallets.create(owner, { name: 'Home', bank: 'BK', balance: 100000, currency: 'RWF' } as any);
  const mine = await w.wallets.create(personal, { name: 'Mine', bank: 'BK', balance: 50000, currency: 'RWF' } as any);
  const bal = (id: string) => Number(w.db.tables.wallet.find(x => x.id === id)!.balance);
  return { w, fam, svc, owner, kevin, eric, grace, personal, home, mine, bal };
}

describe('Family debts', () => {
  test('owners and admins record them; members and viewers can only read', async () => {
    const { svc, owner, kevin, eric, grace, w, fam } = await setup();
    const d: any = await svc.create(owner, { kind: 'BORROWED', person: 'Bank', amount: 50000, currency: 'RWF' } as any);
    expect(w.db.tables.debt[0]).toMatchObject({ clientId: 'aline', familyId: fam.id });
    await svc.create(kevin, { kind: 'LENT', person: 'Neighbour', amount: 2000, currency: 'RWF' } as any);
    await expect(svc.create(eric, { kind: 'BORROWED', person: 'X', amount: 1, currency: 'RWF' } as any)).rejects.toMatchObject({ response: { code: 'FORBIDDEN_ACTION' } });
    expect((await svc.list(grace)).map((x: any) => x.person).sort()).toEqual(['Bank', 'Neighbour']);
    expect((await svc.findOne(eric, d.id) as any).remaining).toBe(50000);
    await expect(svc.addPayment(eric, d.id, { amount: 10 } as any)).rejects.toThrow();
    await expect(svc.remove(grace, d.id)).rejects.toThrow();
  });

  test('a family debt is invisible from Personal, and a personal one from the family', async () => {
    const { svc, owner, personal } = await setup();
    const f: any = await svc.create(owner, { kind: 'BORROWED', person: 'Bank', amount: 1000, currency: 'RWF' } as any);
    const p: any = await svc.create(personal, { kind: 'BORROWED', person: 'Mum', amount: 500, currency: 'RWF' } as any);
    expect((await svc.list(personal)).map((x: any) => x.person)).toEqual(['Mum']);
    expect((await svc.list(owner)).map((x: any) => x.person)).toEqual(['Bank']);
    await expect(svc.findOne(personal, f.id)).rejects.toThrow();
    await expect(svc.findOne(owner, p.id)).rejects.toThrow();
    await expect(svc.addPayment(owner, p.id, { amount: 1 } as any)).rejects.toThrow();
    expect(((await svc.summary(owner)) as any).owe).toEqual({ RWF: 1000 });
    expect(((await svc.summary(personal)) as any).owe).toEqual({ RWF: 500 });
  });

  test('money lent by the family comes out of a family wallet and is paid back into one, recorded in the family only', async () => {
    const { svc, owner, kevin, personal, home, mine, bal, w, fam } = await setup();
    const d: any = await svc.create(owner, { kind: 'LENT', person: 'Neighbour', amount: 20000, currency: 'RWF', walletId: home.id } as any);
    expect(bal(home.id)).toBe(80000);
    await expect(svc.create(owner, { kind: 'LENT', person: 'Z', amount: 5, currency: 'RWF', walletId: mine.id } as any)).rejects.toThrow();   // a personal wallet is not the family's
    await svc.addPayment(kevin, d.id, { amount: 5000, walletId: home.id } as any);
    expect(bal(home.id)).toBe(85000);
    expect(bal(mine.id)).toBe(50000);
    const rows = w.db.tables.transaction.filter(t => t.debtId === d.id);
    expect(rows.map(t => t.familyId)).toEqual([fam.id, fam.id]);
    expect(rows.map(t => t.debtRole).sort()).toEqual(['LEND_OUT', 'REPAY_IN']);
    expect(((await svc.ledgerTransactions(personal, 'LENT')) as any).items).toHaveLength(0);
    expect(((await svc.ledgerTransactions(owner, 'LENT')) as any).items).toHaveLength(2);
    expect(((await svc.transactionsOf(owner, d.id)) as any)).toHaveLength(2);
  });

  test('paying off a family debt closes it and tells the managers; removing it takes its rows away', async () => {
    const { svc, owner, w, fam } = await setup();
    const d: any = await svc.create(owner, { kind: 'BORROWED', person: 'Bank', amount: 1000, currency: 'RWF' } as any);
    w.notified.length = 0;
    const done: any = await svc.addPayment(owner, d.id, { amount: 1000 } as any);
    expect(done.status).toBe('SETTLED');
    expect(w.notified.some(n => n[0] === 'aline' && String(n[1]).includes('settled'))).toBe(true);
    await svc.remove(owner, d.id);
    expect(w.db.tables.debt).toHaveLength(0);
    expect(w.db.tables.transaction.filter(t => t.familyId === fam.id && t.debtId)).toHaveLength(0);
  });
});
