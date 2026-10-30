import { makeWorld } from '../family/family.fake';
import { TrashService } from '../transaction/trash.service';
import { diffFields } from './activity';

const wallet = (name: string, balance = 1000) => ({ name, bank: 'BK', balance, currency: 'RWF' }) as any;
const spend = (walletId: string, amount: number, title = 'Lunch') => ({ type: 'EXPENSE', category: 'food', title, amount, walletId }) as any;
const events = (w: ReturnType<typeof makeWorld>) => w.db.tables.activityEvent;

describe('Activity timeline', () => {
  test('creating, editing, deleting and restoring each leave one line, edits with before → after', async () => {
    const w = makeWorld();
    const me = await w.scopeOf('aline');
    const main = await w.wallets.create(me, wallet('Main'));
    const tx: any = await w.transactions.create(me, spend(main.id, 100));
    await w.transactions.update(me, tx.id, { amount: 150, title: 'Dinner' });
    const del: any = await w.transactions.remove(me, tx.id);
    await new TrashService(w.db as any, w.transactions).restore(me, del.trashId);
    const kinds = events(w).map(e => e.kind);
    expect(kinds).toEqual(['wallet.created', 'transaction.created', 'transaction.edited', 'transaction.deleted', 'transaction.restored']);
    const edit = events(w).find(e => e.kind === 'transaction.edited')!;
    expect(edit.changes).toEqual([{ field: 'title', from: 'Lunch', to: 'Dinner' }, { field: 'amount', from: 100, to: 150 }]);
  });

  test('wallet edits and transfers are recorded; a failing timeline never breaks the money', async () => {
    const w = makeWorld();
    const me = await w.scopeOf('aline');
    const a = await w.wallets.create(me, wallet('A'));
    const b = await w.wallets.create(me, wallet('B', 0));
    await w.wallets.update(me, a.id, { name: 'Alpha' } as any);
    await w.wallets.transfer(me, { fromWalletId: a.id, toWalletId: b.id, amount: 100 });
    expect(events(w).map(e => e.kind)).toEqual(['wallet.created', 'wallet.created', 'wallet.edited', 'wallet.transfer']);
    expect(events(w)[2].changes).toEqual([{ field: 'name', from: 'A', to: 'Alpha' }]);
    (w.db as any).activityEvent.create = async () => { throw new Error('down'); };
    await expect(w.transactions.create(me, spend(a.id, 10))).resolves.toBeDefined();
  });

  test('a budget change is recorded with the old and new limit', async () => {
    const w = makeWorld();
    const me = await w.scopeOf('aline');
    await w.budgets.upsert(me, { limit: 1000, month: 3, year: 2026 } as any);
    await w.budgets.upsert(me, { limit: 1500, month: 3, year: 2026 } as any);
    const rows = events(w).filter(e => e.kind === 'budget.set');
    expect(rows).toHaveLength(2);
    expect(rows[1].changes).toEqual([{ field: 'limit', from: 1000, to: 1500 }]);
  });

  test('family changes also reach the timeline of that family only', async () => {
    const w = makeWorld();
    const owner = await w.scopeOf('aline');
    expect(owner.kind).toBe('personal');
    await w.families.log(w.db as any, 'fam-12345678', 'aline', 'member.role_changed', 'eric', { from: 'MEMBER', to: 'VIEWER' });
    const e = events(w).find(x => x.kind === 'family.member.role_changed')!;
    expect(e.scopeKey).toBe('f:fam-12345678');
    expect(e.changes).toEqual([{ field: 'role', from: 'MEMBER', to: 'VIEWER' }]);
  });

  test('checking a balance: a match is remembered, a difference changes nothing until asked, then a visible adjustment puts it right', async () => {
    const w = makeWorld();
    const me = await w.scopeOf('aline');
    const a = await w.wallets.create(me, wallet('A', 1000));
    const bal = () => Number(w.db.tables.wallet.find(x => x.id === a.id)!.balance);
    const ok: any = await w.wallets.reconcile(me, a.id, { actualBalance: 1000 });
    expect(ok.matches).toBe(true);
    expect(w.db.tables.wallet.find(x => x.id === a.id)!.reconciledAt).toBeTruthy();
    const diff: any = await w.wallets.reconcile(me, a.id, { actualBalance: 900 });
    expect([diff.matches, diff.difference, diff.adjusted, bal()]).toEqual([false, -100, false, 1000]);
    const fixed: any = await w.wallets.reconcile(me, a.id, { actualBalance: 900, adjust: true });
    expect([fixed.adjusted, bal()]).toEqual([true, 900]);
    const tx = w.db.tables.transaction.find(t => t.id === fixed.transactionId)!;
    expect([tx.type, Number(tx.amount), tx.title]).toEqual(['EXPENSE', 100, 'Balance adjustment']);
    await expect(w.wallets.reconcile(me, a.id, { actualBalance: NaN })).rejects.toThrow();
  });

  test('diffFields only reports what really changed', () => {
    expect(diffFields({ a: 1, b: 'x', c: null }, { a: 1, b: 'y', c: '' }, ['a', 'b', 'c'])).toEqual([{ field: 'b', from: 'x', to: 'y' }]);
  });
});
