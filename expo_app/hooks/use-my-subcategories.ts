import { useCallback, useEffect, useState } from 'react';
import { getMySubCategories, removeMySubCategory } from '@/services/subcategory.service';
import type { MySubCategory } from '@/utils/category-search';

/**
 * The person's own subcategories. Loaded when the screen asks (`reload`) and kept in memory; a failed load just leaves the
 * list empty, because the built-in suggestions still work without it.
 */
export function useMySubCategories() {
  const [mine, setMine] = useState<MySubCategory[]>([]);

  const reload = useCallback(() => {
    getMySubCategories().then(setMine).catch(() => { /* offline: suggestions only */ });
  }, []);

  useEffect(reload, [reload]);

  /** Removes it from the list at once, then on the server (and puts it back if that fails). */
  const forget = useCallback((row: MySubCategory) => {
    setMine(list => list.filter(m => m.id !== row.id));
    removeMySubCategory(row.id).catch(() => setMine(list => (list.some(m => m.id === row.id) ? list : [...list, row])));
  }, []);

  return { mine, reload, forget };
}
