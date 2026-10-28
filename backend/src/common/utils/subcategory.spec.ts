import { rememberSubCategory } from './subcategory';

const fake = () => {
  const upsert = jest.fn(async () => ({}));
  return { prx: { userSubCategory: { upsert } } as any, upsert };
};

describe('rememberSubCategory', () => {
  it('saves the subcategory for this account and category, counting the use', async () => {
    const { prx, upsert } = fake();
    await rememberSubCategory(prx, 'c1', 'EXPENSE', 'transport', '  Boda   to market ');
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = (upsert.mock.calls[0] as any[])[0];
    expect(arg.where).toEqual({ clientId_kind_category_name: { clientId: 'c1', kind: 'EXPENSE', category: 'transport', name: 'Boda to market' } });
    expect(arg.create).toMatchObject({ clientId: 'c1', kind: 'EXPENSE', category: 'transport', name: 'Boda to market', usageCount: 1 });
    expect(arg.update.usageCount).toEqual({ increment: 1 });
  });

  it('keeps spending and income apart, and ignores anything else', async () => {
    const { prx, upsert } = fake();
    await rememberSubCategory(prx, 'c1', 'INCOME', 'gifts', 'Family support');
    expect((upsert.mock.calls[0] as any[])[0].where.clientId_kind_category_name.kind).toBe('INCOME');
    await rememberSubCategory(prx, 'c1', 'TRANSFER', 'other', 'x');
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a subcategory', async () => {
    const { prx, upsert } = fake();
    await rememberSubCategory(prx, 'c1', 'EXPENSE', 'food', undefined);
    await rememberSubCategory(prx, 'c1', 'EXPENSE', 'food', '   ');
    await rememberSubCategory(prx, 'c1', 'EXPENSE', 'food', null);
    expect(upsert).not.toHaveBeenCalled();
  });
});
