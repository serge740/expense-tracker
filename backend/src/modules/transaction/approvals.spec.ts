import { makeWorld } from '../family/family.fake';
import { ApprovalsService } from './approvals.service';

async function setup() {
  const w = makeWorld();
  const fam = await w.families.create('aline', { name: 'Uwase home' } as any).then((r: any) => r.family ?? r);
  await w.join(fam.id, 'aline', [['eric', 'MEMBER'], ['grace', 'VIEWER'], ['kevin', 'ADMIN']]);
  const sent: unknown[][] = [];
  const approvals = new ApprovalsService(w.db as any, w.access, w.transactions, { notify: (...a: unknown[]) => { sent.push(a); }, nudge: () => {} } as any);
  const owner = await w.scopeOf('aline', fam.id);
  const eric = await w.scopeOf('eric', fam.id);
  const kevin = await w.scopeOf('kevin', fam.id);
  const wallet = await w.wallets.create(owner, { name: 'Home', bank: 'BK', balance: 200000, currency: 'RWF' } as any);
  const balance = () => Number(w.db.tables.wallet.find(x => x.id === wallet.id)!.balance);
  const spend = (s: any, amount: number, title = 'Big buy') => w.transactions.create(s, { type: 'EXPENSE', category: 'shopping', title, amount, walletId: wallet.id, date: '2026-10-01T10:00:00.000Z' } as any);
  return { w, fam, approvals, owner, eric, kevin, wallet, balance, spend, sent };
}

describe('Family approvals', () => {
  test('with no threshold nothing waits', async () => {
    const { eric, spend, balance } = await setup();
    const r: any = await spend(eric, 50000);
    expect(r.pending).toBeUndefined();
    expect(balance()).toBe(150000);
  });

  test('a member expense above the threshold waits (no transaction, no balance change); smaller ones and owner or admin spending go straight through', async () => {
    const { w, fam, approvals, owner, eric, kevin, spend, balance } = await setup();
    await approvals.setSettings('aline', fam.id, { threshold: 10000 });
    const held: any = await spend(eric, 20000);
    expect([held.pending, balance(), w.db.tables.transaction.length]).toEqual([true, 200000, 0]);
    expect(((await spend(eric, 10000)) as any).pending).toBeUndefined();
    expect(((await spend(kevin, 50000)) as any).pending).toBeUndefined();
    expect(((await spend(owner, 50000)) as any).pending).toBeUndefined();
    expect(balance()).toBe(200000 - 10000 - 50000 - 50000);
  });

  test('approving adds the expense in the member name with its original date and moves the balance once', async () => {
    const { w, fam, approvals, eric, spend, balance, sent } = await setup();
    await approvals.setSettings('aline', fam.id, { threshold: 10000 });
    const held: any = await spend(eric, 20000, 'Sofa');
    expect(sent.map(s => s[0]).sort()).toEqual(['aline', 'kevin']);
    sent.length = 0;
    const done: any = await approvals.approve('kevin', fam.id, held.approvalId);
    const tx = w.db.tables.transaction.find(t => t.id === done.transactionId)!;
    expect([tx.clientId, Number(tx.amount), tx.title, balance()]).toEqual(['eric', 20000, 'Sofa', 180000]);
    expect(new Date(tx.date as any).toISOString()).toBe('2026-10-01T10:00:00.000Z');
    expect(sent.some(s => s[0] === 'eric' && s[1] === 'Approved')).toBe(true);
    await expect(approvals.approve('aline', fam.id, held.approvalId)).rejects.toThrow();
    expect(balance()).toBe(180000);
  });

  test('rejecting adds nothing and tells the member why; only owners and admins decide', async () => {
    const { fam, approvals, eric, spend, balance, sent } = await setup();
    await approvals.setSettings('aline', fam.id, { threshold: 10000 });
    const held: any = await spend(eric, 30000);
    await expect(approvals.approve('eric', fam.id, held.approvalId)).rejects.toThrow();
    await expect(approvals.reject('grace', fam.id, held.approvalId, {})).rejects.toThrow();
    sent.length = 0;
    await approvals.reject('aline', fam.id, held.approvalId, { reason: 'Too much this month' });
    expect(balance()).toBe(200000);
    expect(String(sent.find(s => s[0] === 'eric')![2])).toContain('Too much this month');
    const mine: any = await approvals.list('eric', fam.id);
    expect([mine.items[0].status, mine.canDecide]).toEqual(['REJECTED', false]);
  });

  test('a member sees only their own requests, the owner sees all, and only the maker takes a request back', async () => {
    const { fam, approvals, eric, spend } = await setup();
    await approvals.setSettings('aline', fam.id, { threshold: 1000 });
    const a: any = await spend(eric, 5000, 'A');
    expect(((await approvals.list('eric', fam.id)) as any).items).toHaveLength(1);
    expect(((await approvals.list('aline', fam.id)) as any).items).toHaveLength(1);
    expect(((await approvals.list('grace', fam.id)) as any).items).toHaveLength(0);
    await expect(approvals.cancel('aline', fam.id, a.approvalId)).rejects.toThrow();
    await approvals.cancel('eric', fam.id, a.approvalId);
    expect(((await approvals.list('aline', fam.id, 'PENDING')) as any).items).toHaveLength(0);
  });

  test('only the owner sets the threshold, a bad one is refused, and null switches it off', async () => {
    const { fam, approvals } = await setup();
    await expect(approvals.setSettings('kevin', fam.id, { threshold: 5 })).rejects.toThrow();
    await expect(approvals.setSettings('aline', fam.id, { threshold: -1 })).rejects.toThrow();
    expect(((await approvals.setSettings('aline', fam.id, { threshold: 5000 })) as any).threshold).toBe(5000);
    expect(((await approvals.setSettings('aline', fam.id, { threshold: null })) as any).threshold).toBeNull();
    await expect(approvals.getSettings('divine', fam.id)).rejects.toThrow();
  });
});
