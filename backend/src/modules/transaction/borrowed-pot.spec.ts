import { BadRequestException } from '@nestjs/common';
import { TransactionService } from './transaction.service';

// A tiny fake of the database client: only what createInTx / remove touch.
function fake(debt: any) {
  const calls: any = { debtUpdates: [], created: [], walletUpdates: [] };
  const prx: any = {
    debt: {
      findFirst: async () => debt,
      update: async (a: any) => { calls.debtUpdates.push(a); },
      updateMany: async (a: any) => { calls.debtUpdates.push(a); },
    },
    transaction: { create: async (a: any) => { calls.created.push(a.data); return { id: 't1', ...a.data }; }, delete: async () => ({}) },
    wallet: { update: async (a: any) => { calls.walletUpdates.push(a); }, updateMany: async () => ({}) },
  };
  return { prx, calls };
}
const service = () => new TransactionService({} as any, { notify: () => {} } as any);
const debt = (o: any = {}) => ({ id: 'd1', kind: 'BORROWED', status: 'OPEN', archivedAt: null, amount: 100000, spent: 30000, currency: 'RWF', ...o });
const dto = (o: any = {}) => ({ type: 'EXPENSE' as const, category: 'food' as any, title: 'Lunch', amount: 20000, fundedByDebtId: 'd1', ...o });

describe('spending borrowed money (a debt\'s pot)', () => {
  it('records an ordinary expense tagged to the debt, with no wallet, and raises the debt\'s spent', async () => {
    const { prx, calls } = fake(debt());
    await service().createInTx(prx, 'c1', dto({ walletId: 'w1' }));
    expect(calls.created[0]).toMatchObject({ type: 'EXPENSE', amount: 20000, fundedByDebtId: 'd1' });
    expect(calls.created[0].walletId).toBeUndefined();
    expect(calls.created[0].debtRole).toBeUndefined();
    expect(calls.walletUpdates).toHaveLength(0);
    expect(calls.debtUpdates[0].data).toEqual({ spent: { increment: 20000 } });
  });

  it('allows spending exactly what is left (70,000) but not a cent more', async () => {
    await expect(service().createInTx(fake(debt()).prx, 'c1', dto({ amount: 70000 }))).resolves.toBeTruthy();
    await expect(service().createInTx(fake(debt()).prx, 'c1', dto({ amount: 70001 }))).rejects.toThrow(BadRequestException);
  });

  it('refuses income, credits, closed debts and unknown debts', async () => {
    await expect(service().createInTx(fake(debt()).prx, 'c1', dto({ type: 'INCOME' }))).rejects.toThrow(BadRequestException);
    await expect(service().createInTx(fake(debt({ kind: 'LENT' })).prx, 'c1', dto())).rejects.toThrow(BadRequestException);
    await expect(service().createInTx(fake(debt({ status: 'SETTLED' })).prx, 'c1', dto())).rejects.toThrow(BadRequestException);
    await expect(service().createInTx(fake(null).prx, 'c1', dto())).rejects.toThrow(BadRequestException);
  });

  it('cannot be edited, and deleting it gives the money back to the pot', async () => {
    const existing = { id: 't1', clientId: 'c1', type: 'EXPENSE', amount: 20000, walletId: null, debtId: null, fundedByDebtId: 'd1' };
    const { prx, calls } = fake(debt());
    const svc: any = new TransactionService({ $transaction: (fn: any) => fn(prx) } as any, { notify: () => {} } as any);
    svc.assertOwner = async () => existing;
    await expect(svc.update('c1', 't1', { title: 'x' })).rejects.toThrow(BadRequestException);
    await svc.remove('c1', 't1');
    expect(calls.debtUpdates[0].data).toEqual({ spent: { decrement: 20000 } });
  });
});
