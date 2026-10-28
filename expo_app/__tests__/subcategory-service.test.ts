import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('@/api', () => ({ __esModule: true, default: { get: jest.fn(), delete: jest.fn() } }));
const api = require('@/api').default as { get: jest.Mock<(...a: any[]) => Promise<any>> };
import { getMySubCategories } from '@/services/subcategory.service';

const row = { id: 'a', kind: 'EXPENSE', category: 'food', name: 'Pizza', usageCount: 1, lastUsedAt: '2030-01-01T00:00:00.000Z' };
beforeEach(() => { jest.clearAllMocks(); });

describe('getMySubCategories', () => {
  test('returns the list the server sends', async () => {
    api.get.mockResolvedValue({ data: [row] });
    expect(await getMySubCategories()).toEqual([row]);
    expect(api.get).toHaveBeenCalledWith('/subcategories');
  });

  test('a web page where the list should be (a path the server does not know) is an empty list, not a crash', async () => {
    api.get.mockResolvedValue({ data: '<!doctype html><html><body>AbyExpense</body></html>' });
    expect(await getMySubCategories()).toEqual([]);
  });
});
