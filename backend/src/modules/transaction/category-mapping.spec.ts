import { TransactionService } from './transaction.service';

// A tiny fake of the database client: only what createInTx touches.
function fake() {
  const calls: any = { created: [] as any[], remembered: [] as any[] };
  const prx: any = {
    transaction: { create: async (a: any) => { calls.created.push(a.data); return { id: 't1', ...a.data }; } },
    wallet: { update: async () => ({}) },
    userSubCategory: { upsert: async (a: any) => { calls.remembered.push(a.where.clientId_kind_category_name); } },
  };
  return { prx, calls };
}
const service = () => new TransactionService({} as any, { notify: () => {} } as any);
const dto = (o: any = {}) => ({ type: 'EXPENSE' as const, category: 'food' as any, title: 'Lunch', amount: 5000, ...o });

describe('categories when a transaction is created', () => {
  it('turns a retired category an older app sends into the new one, with its subcategory', async () => {
    const { prx, calls } = fake();
    await service().createInTx(prx, 'c1', dto({ category: 'groceries' }));
    expect(calls.created[0]).toMatchObject({ category: 'food', subCategory: 'Groceries' });
    expect(calls.remembered).toEqual([{ clientId: 'c1', kind: 'EXPENSE', category: 'food', name: 'Groceries' }]);
  });

  it('keeps what the person chose over what the old name implies', async () => {
    const { prx, calls } = fake();
    await service().createInTx(prx, 'c1', dto({ category: 'fuel', subCategory: 'Motorbike fuel' }));
    expect(calls.created[0]).toMatchObject({ category: 'transport', subCategory: 'Motorbike fuel' });
  });

  it('saves a typed subcategory to their own list', async () => {
    const { prx, calls } = fake();
    await service().createInTx(prx, 'c1', dto({ category: 'transport', subCategory: ' Boda to market ' }));
    expect(calls.created[0].subCategory).toBe('Boda to market');
    expect(calls.remembered).toEqual([{ clientId: 'c1', kind: 'EXPENSE', category: 'transport', name: 'Boda to market' }]);
  });

  it('stores no subcategory when there is none, and remembers nothing', async () => {
    const { prx, calls } = fake();
    await service().createInTx(prx, 'c1', dto());
    expect(calls.created[0].subCategory).toBeNull();
    expect(calls.remembered).toEqual([]);
  });

  it('does not count a scheduled post as a new choice', async () => {
    const { prx, calls } = fake();
    await service().createInTx(prx, 'c1', dto({ subCategory: 'Rent' }), { scheduledOccurrenceId: 'o1' });
    expect(calls.created[0].subCategory).toBe('Rent');
    expect(calls.remembered).toEqual([]);
  });
});
