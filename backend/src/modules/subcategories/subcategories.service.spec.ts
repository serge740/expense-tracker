import { NotFoundException } from '@nestjs/common';
import { SubCategoriesService } from './subcategories.service';

describe('SubCategoriesService (a person own list)', () => {
  it('lists only this account rows, most recently used first', async () => {
    const findMany = jest.fn(async () => [{ id: 'a', clientId: 'c1', kind: 'EXPENSE', category: 'food', name: 'Pizza', usageCount: 3, lastUsedAt: new Date(0), createdAt: new Date(0) }]);
    const svc = new SubCategoriesService({ userSubCategory: { findMany } } as any);
    expect(await svc.list('c1')).toEqual([{ id: 'a', kind: 'EXPENSE', category: 'food', name: 'Pizza', usageCount: 3, lastUsedAt: new Date(0) }]);
    const arg = (findMany.mock.calls[0] as any[])[0];
    expect(arg.where).toEqual({ clientId: 'c1' });
    expect(arg.orderBy[0]).toEqual({ lastUsedAt: 'desc' });
  });

  it('removes a row only when it belongs to the account', async () => {
    const deleteMany = jest.fn(async () => ({ count: 1 }));
    const svc = new SubCategoriesService({ userSubCategory: { deleteMany } } as any);
    await expect(svc.remove('c1', 'row1')).resolves.toEqual({ success: true });
    expect((deleteMany.mock.calls[0] as any[])[0].where).toEqual({ id: 'row1', clientId: 'c1' });
  });

  it('says so when nothing was removed (someone elses row, or already gone)', async () => {
    const svc = new SubCategoriesService({ userSubCategory: { deleteMany: async () => ({ count: 0 }) } } as any);
    await expect(svc.remove('c1', 'row1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
