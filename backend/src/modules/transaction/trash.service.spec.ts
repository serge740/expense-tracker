import { makeWorld } from '../family/family.fake';
import { TrashService } from './trash.service';

const wallet = (name: string, balance = 1000) => ({ name, bank: 'BK', balance, currency: 'RWF' }) as any;
const spend = (walletId: string, amount: number, title = 'Lunch') => ({ type: 'EXPENSE', category: 'food', title, amount, walletId }) as any;

async function setup() {
  const w = makeWorld();
  const trash = new TrashService(w.db as any, w.transactions);
  const me = await w.scopeOf('aline');
  const main = await w.wallets.create(me, wallet('Main', 1000));
  const other = await w.wallets.create(me, wallet('Other', 500));
  const balance = (id: string) => Number(w.db.tables.wallet.find(x => x.id === id)!.balance);
  return { w, trash, me, main, other, balance };
}

describe('Recently deleted', () => {
  test('delete → restore puts the same row back and every balance as it was', async () => {
    const { w, trash, me, main, balance } = await setup();
    const tx: any = await w.transactions.create(me, spend(main.id, 100));
    expect(balance(main.id)).toBe(900);
    const del: any = await w.transactions.remove(me, tx.id);
    expect(balance(main.id)).toBe(1000);
    expect((await trash.list(me)).items).toHaveLength(1);
    const r = await trash.restore(me, del.trashId);
    expect(r.transactionId).toBe(tx.id);
    expect(balance(main.id)).toBe(900);
    expect((await trash.list(me)).items).toHaveLength(0);
    await expect(trash.restore(me, del.trashId)).rejects.toThrow();
  });

  test('a transfer restores both sides', async () => {
    const { w, trash, me, main, other, balance } = await setup();
    const tr: any = await w.wallets.transfer(me, { fromWalletId: main.id, toWalletId: other.id, amount: 200 });
    expect([balance(main.id), balance(other.id)]).toEqual([800, 700]);
    const del: any = await w.transactions.remove(me, tr.id);
    expect([balance(main.id), balance(other.id)]).toEqual([1000, 500]);
    await trash.restore(me, del.trashId);
    expect([balance(main.id), balance(other.id)]).toEqual([800, 700]);
  });

  test('it cannot be restored once its wallet is gone, and other people cannot see it', async () => {
    const { w, trash, me, main } = await setup();
    const tx: any = await w.transactions.create(me, spend(main.id, 50));
    const del: any = await w.transactions.remove(me, tx.id);
    const eric = await w.scopeOf('eric');
    expect((await trash.list(eric)).items).toHaveLength(0);
    await expect(trash.restore(eric, del.trashId)).rejects.toThrow();
    w.db.tables.wallet.splice(0, w.db.tables.wallet.length);
    await expect(trash.restore(me, del.trashId)).rejects.toThrow(/wallet/);
  });

  test('delete forever removes it from the list', async () => {
    const { w, trash, me, main } = await setup();
    const tx: any = await w.transactions.create(me, spend(main.id, 50));
    const del: any = await w.transactions.remove(me, tx.id);
    await trash.purge(me, del.trashId);
    expect((await trash.list(me)).items).toHaveLength(0);
  });
});

describe('bulk changes', () => {
  test('delete several: every one is kept for Undo; the balance is right', async () => {
    const { w, trash, me, main, balance } = await setup();
    const a: any = await w.transactions.create(me, spend(main.id, 100, 'A'));
    const b: any = await w.transactions.create(me, spend(main.id, 50, 'B'));
    const res = await trash.bulk(me, { ids: [a.id, b.id], action: 'delete' });
    expect(res.done).toHaveLength(2);
    expect(res.trashIds).toHaveLength(2);
    expect(balance(main.id)).toBe(1000);
    for (const id of res.trashIds) await trash.restore(me, id);
    expect(balance(main.id)).toBe(850);
  });

  test('a row that cannot change is named with a reason and the rest still go through', async () => {
    const { w, trash, me, main, other, balance } = await setup();
    const a: any = await w.transactions.create(me, spend(main.id, 100, 'A'));
    const t: any = await w.wallets.transfer(me, { fromWalletId: main.id, toWalletId: other.id, amount: 10 });
    const res = await trash.bulk(me, { ids: [a.id, t.id, 'missing'], action: 'category', category: 'transport' });
    expect(res.done).toEqual([a.id]);
    expect(res.failed.map(f => f.id).sort()).toEqual([t.id, 'missing'].sort());
    expect(res.failed.every(f => f.reason.length > 0)).toBe(true);
    expect(w.db.tables.transaction.find(x => x.id === a.id)!.category).toBe('transport');
    expect(balance(main.id)).toBe(890);
  });

  test('move to another wallet shifts the balance', async () => {
    const { w, trash, me, main, other, balance } = await setup();
    const a: any = await w.transactions.create(me, spend(main.id, 100));
    await trash.bulk(me, { ids: [a.id], action: 'wallet', walletId: other.id });
    expect([balance(main.id), balance(other.id)]).toEqual([1000, 400]);
  });

  test('empty, unknown and too many are refused', async () => {
    const { trash, me } = await setup();
    await expect(trash.bulk(me, { ids: [], action: 'delete' })).rejects.toThrow();
    await expect(trash.bulk(me, { ids: ['x'], action: 'nuke' })).rejects.toThrow();
    await expect(trash.bulk(me, { ids: Array.from({ length: 201 }, (_, i) => 'i' + i), action: 'delete' })).rejects.toThrow();
  });
});
