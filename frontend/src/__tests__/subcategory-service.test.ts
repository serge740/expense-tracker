import { beforeEach, describe, expect, test, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../api', () => ({ default: { get, delete: vi.fn() } }));
import { getMySubCategories } from '@/services/subcategory.service';

const row = { id: 'a', kind: 'EXPENSE', category: 'food', name: 'Pizza', usageCount: 1, lastUsedAt: '2030-01-01T00:00:00.000Z' };
beforeEach(() => get.mockReset());

describe('getMySubCategories', () => {
  test('returns the list the server sends', async () => {
    get.mockResolvedValue({ data: [row] });
    expect(await getMySubCategories()).toEqual([row]);
    expect(get).toHaveBeenCalledWith('/subcategories');
  });

  test('a web page where the list should be (a path the dev server did not forward) is an empty list, not a crash', async () => {
    get.mockResolvedValue({ data: '<!doctype html><html><body>AbyEx</body></html>' });
    expect(await getMySubCategories()).toEqual([]);
  });
});
