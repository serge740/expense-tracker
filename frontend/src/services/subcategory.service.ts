// Ported from expo_app/services/subcategory.service.ts
import api from '../api';
import { asMySubCategories, type MySubCategory } from '@/utils/category-search';

/** Everything this person has typed or picked as a subcategory, most recently used first. Private to their account. */
export const getMySubCategories = (): Promise<MySubCategory[]> => api.get('/subcategories').then(r => asMySubCategories(r.data));

/** Takes one off their list. Transactions already saved with it are not changed. */
export const removeMySubCategory = (id: string): Promise<{ success: boolean }> => api.delete(`/subcategories/${id}`).then(r => r.data);
