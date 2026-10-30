import api from '@/api';
import type { StoredView } from '@/utils/history-url';

export interface SavedView { id: string; name: string; filter: StoredView; createdAt: string; mine: boolean }

/** Named filters: a person's own are private, a family's are shared with the family. */
export const getSavedViews = (): Promise<SavedView[]> => api.get('/transactions/views').then(r => r.data);
export const createSavedView = (name: string, filter: StoredView): Promise<SavedView> => api.post('/transactions/views', { name, filter }).then(r => r.data);
export const renameSavedView = (id: string, name: string): Promise<SavedView> => api.patch(`/transactions/views/${id}`, { name }).then(r => r.data);
export const deleteSavedView = (id: string): Promise<{ success: boolean }> => api.delete(`/transactions/views/${id}`).then(r => r.data);
