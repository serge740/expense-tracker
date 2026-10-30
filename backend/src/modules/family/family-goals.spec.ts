import { makeWorld } from './family.fake';
import { FamilyGoalsService } from './family-goals.service';
import { FamilyCommentsService } from './family-comments.service';

async function setup() {
  const w = makeWorld();
  const fam = await w.families.create('aline', { name: 'Uwase home' } as any).then((r: any) => r.family ?? r);
  await w.join(fam.id, 'aline', [['eric', 'MEMBER'], ['grace', 'VIEWER'], ['kevin', 'ADMIN']]);
  const goals = new FamilyGoalsService(w.db as any, w.access);
  const sent: unknown[][] = [];
  const comments = new FamilyCommentsService(w.db as any, w.access, { notify: (...a: unknown[]) => { sent.push(a); } } as any);
  const owner = await w.scopeOf('aline', fam.id);
  const wallet = await w.wallets.create(owner, { name: 'Home', bank: 'BK', balance: 20000, currency: 'RWF' } as any);
  return { w, fam, goals, comments, wallet, sent, owner };
}

describe('Family goals', () => {
  test('owners and admins create goals, members contribute, viewers only look', async () => {
    const { fam, goals } = await setup();
    const g: any = await goals.create('aline', fam.id, { name: 'New roof', target: 100000 });
    await expect(goals.create('eric', fam.id, { name: 'Nope', target: 10 })).rejects.toThrow();
    await goals.create('kevin', fam.id, { name: 'Holiday', target: 50000 });
    const after: any = await goals.contribute('eric', fam.id, g.id, { amount: 25000, note: 'First' });
    expect([after.saved, after.percent, after.reached]).toEqual([25000, 25, false]);
    await expect(goals.contribute('grace', fam.id, g.id, { amount: 5 })).rejects.toThrow();
    expect((await goals.list('grace', fam.id)).items).toHaveLength(2);
  });

  test('a linked family wallet counts toward the goal, and the goal is reached when saved covers the target', async () => {
    const { fam, goals, wallet } = await setup();
    const g: any = await goals.create('aline', fam.id, { name: 'Fund', target: 30000, walletId: wallet.id });
    expect([g.fromWallet, g.saved]).toEqual([20000, 20000]);
    const done: any = await goals.contribute('eric', fam.id, g.id, { amount: 10000 });
    expect([done.saved, done.percent, done.reached]).toEqual([30000, 100, true]);
    expect(done.contributions[0].by).toBe('Eric Uwase');
  });

  test('a contribution can be taken back by its maker or an admin, not by another member', async () => {
    const { w, fam, goals } = await setup();
    await w.join(fam.id, 'aline', [['divine', 'MEMBER']]);
    const g: any = await goals.create('aline', fam.id, { name: 'Fund', target: 1000 });
    const c1: any = await goals.contribute('eric', fam.id, g.id, { amount: 100 });
    await expect(goals.removeContribution('divine', fam.id, g.id, c1.contributions[0].id)).rejects.toThrow();
    const r: any = await goals.removeContribution('eric', fam.id, g.id, c1.contributions[0].id);
    expect(r.saved).toBe(0);
  });

  test('a goal cannot use a wallet from outside the family, and bad input is refused', async () => {
    const { w, fam, goals } = await setup();
    const mine = await w.scopeOf('aline');
    const personal = await w.wallets.create(mine, { name: 'Mine', bank: 'BK', balance: 5, currency: 'RWF' } as any);
    await expect(goals.create('aline', fam.id, { name: 'X', target: 10, walletId: personal.id })).rejects.toThrow();
    await expect(goals.create('aline', fam.id, { name: '', target: 10 })).rejects.toThrow();
    await expect(goals.create('aline', fam.id, { name: 'X', target: -1 })).rejects.toThrow();
  });

  test('another family or a stranger sees nothing', async () => {
    const { w, fam, goals } = await setup();
    const g: any = await goals.create('aline', fam.id, { name: 'Roof', target: 10 });
    await expect(goals.list('divine', fam.id)).rejects.toThrow();
    const other = await w.families.create('divine', { name: 'Other' } as any).then((r: any) => r.family ?? r);
    await expect(goals.get('divine', other.id, g.id)).rejects.toThrow();
  });
});

describe('Family comments', () => {
  test('everyone in the family can comment, the author and earlier commenters are told, the commenter is not', async () => {
    const { w, fam, owner, wallet, comments, sent } = await setup();
    const eric = await w.scopeOf('eric', fam.id);
    const tx: any = await w.transactions.create(eric, { type: 'EXPENSE', category: 'food', title: 'Rice', amount: 100, walletId: wallet.id } as any);
    await comments.add('aline', fam.id, tx.id, { body: 'Was this the big bag?' });
    expect(sent.map(s => s[0])).toEqual(['eric']);
    sent.length = 0;
    await comments.add('grace', fam.id, tx.id, { body: 'Looks fine' });
    expect(sent.map(s => s[0]).sort()).toEqual(['aline', 'eric']);
    const list: any = await comments.list('kevin', fam.id, tx.id);
    expect(list.items.map((c: any) => c.author.name)).toEqual(['Aline Uwase', 'Grace Uwase']);
    expect(owner.kind).toBe('family');
  });

  test('only the author or an admin deletes a comment; empty or long text is refused; another family cannot read', async () => {
    const { w, fam, wallet, comments } = await setup();
    const eric = await w.scopeOf('eric', fam.id);
    const tx: any = await w.transactions.create(eric, { type: 'EXPENSE', category: 'food', title: 'Rice', amount: 100, walletId: wallet.id } as any);
    const list: any = await comments.add('eric', fam.id, tx.id, { body: 'mine' });
    const id = list.items[0].id;
    await expect(comments.remove('grace', fam.id, id)).rejects.toThrow();
    await expect(comments.add('eric', fam.id, tx.id, { body: '  ' })).rejects.toThrow();
    await expect(comments.add('eric', fam.id, tx.id, { body: 'x'.repeat(501) })).rejects.toThrow();
    const other = await w.families.create('divine', { name: 'Other' } as any).then((r: any) => r.family ?? r);
    await expect(comments.list('divine', other.id, tx.id)).rejects.toThrow();
    await comments.remove('kevin', fam.id, id);
    expect((await comments.list('eric', fam.id, tx.id) as any).items).toHaveLength(0);
  });
});
