import api from '@/api';
import { periodParams } from '@/utils/period';
import { isServerGroup, type Facets, type FeedRow, type FeedSummary, type GroupSummary, type HistoryFilter } from '@/utils/history';

/** What the server is asked: the period, the kinds, the loans switch, wallets, member, search words, category choices, amount, receipt, source and sort. */
export function feedParams(f: HistoryFilter, extra: Record<string, string | number | undefined> = {}): Record<string, string | number> {
  const out: Record<string, string | number> = { ...periodParams(f.period) };
  if (f.kinds.length) out.kinds = f.kinds.join(',');
  if (!f.includeLoans) out.includeLoans = 'false';
  if (f.walletIds.length) out.walletIds = f.walletIds.join(',');
  if (f.memberId) out.memberId = f.memberId;
  if (f.search.trim()) out.search = f.search.trim();
  if (f.include.length) out.categories = JSON.stringify(f.include);
  if (f.exclude.length) out.excludeCategories = JSON.stringify(f.exclude);
  if (f.minAmount !== null) out.minAmount = f.minAmount;
  if (f.maxAmount !== null) out.maxAmount = f.maxAmount;
  if (f.receipt !== 'any') out.receipt = f.receipt;
  if (f.source !== 'any') out.source = f.source;
  if (f.schedules.length) out.schedules = f.schedules.join(',');
  if (f.schedMode !== 'any') out.schedMode = f.schedMode;
  if (f.flags.length) out.flags = f.flags.join(',');
  if (f.tags.length) out.tags = f.tags.join(',');
  if (isServerGroup(f.group) && f.sort !== 'largest' && f.sort !== 'smallest') out.groupBy = f.group;
  if (f.sort !== 'newest') out.sort = f.sort;
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== '') out[k] = v;
  return out;
}

/** A page of rows (newest first, transfers included) and where the next page starts (null at the end). */
export const getFeed = (f: HistoryFilter, opts: { cursor?: string | null; limit?: number; fallbackCurrency: string }): Promise<{ items: FeedRow[]; nextCursor: string | null }> =>
  api.get('/transactions/feed', { params: feedParams(f, { cursor: opts.cursor ?? undefined, limit: opts.limit ?? 40, fallbackCurrency: opts.fallbackCurrency }) }).then(r => r.data);

/** Totals for everything the filter matches, per currency, with the change since the period before. */
export const getFeedSummary = (f: HistoryFilter, opts: { fallbackCurrency: string; convertTo?: string }): Promise<FeedSummary> =>
  api.get('/transactions/summary', { params: feedParams(f, { fallbackCurrency: opts.fallbackCurrency, convertTo: opts.convertTo }) }).then(r => r.data);

/** The categories and sub-categories used, with counts that follow every other filter (a category choice never hides the rest). */
export const getFacets = (f: HistoryFilter): Promise<Facets> =>
  api.get('/transactions/facets', { params: feedParams({ ...f, include: [], exclude: [] }) }).then(r => r.data);

/** One header per category, wallet, member or title, with totals for the whole filter. */
export const getGroups = (f: HistoryFilter, opts: { fallbackCurrency: string }): Promise<{ groupBy: string; groups: GroupSummary[] }> =>
  api.get('/transactions/groups', { params: feedParams(f, { fallbackCurrency: opts.fallbackCurrency }) }).then(r => r.data);

/** Titles used before and the people a person has loans with, for what is being typed. */
export const getSuggestions = (q: string): Promise<{ titles: Array<{ title: string; count: number }>; people: string[] }> =>
  api.get('/transactions/suggest', { params: { q } }).then(r => r.data);

export interface Statement {
  wallet: { id: string; name: string; color: string; currency: string; archived: boolean; balance: number; reconciledAt?: string | null; reconciledBalance?: number | null };
  period: { from: string | null; to: string | null };
  opening: number; in: number; out: number; closing: number;
  parts: { income: number; transfersIn: number; spending: number; transfersOut: number };
  count: number; balanced: boolean;
}
/** One wallet over the chosen period: what it started with, what came in and went out, what it ended with. */
export const getStatement = (f: HistoryFilter): Promise<Statement> =>
  api.get('/transactions/statement', { params: feedParams({ ...f, walletIds: f.walletIds.slice(0, 1) }) }).then(r => r.data);

export interface ActivityChange { field: string; from: string | number | null; to: string | number | null }
export interface ActivityItem {
  id: string; kind: string; entity: string; entityId: string | null; title: string;
  amount: number | null; currency: string | null; changes: ActivityChange[] | null; createdAt: string;
  actor?: { name: string; isYou: boolean }; trashId: string | null;
}
export interface ActivityWeek { total: number; added: number; changed: number; deleted: number }
export interface ActivityPage { since: string | null; week?: ActivityWeek; next: string | null; items: ActivityItem[] }
/** What changed, newest first. `entity` narrows it to transactions or wallets; `entityId` to one item's own history. */
export const getActivity = (p: { cursor?: string | null; entity?: string; entityId?: string } = {}): Promise<ActivityPage> =>
  api.get('/activity', { params: { limit: 30, ...(p.cursor ? { cursor: p.cursor } : {}), ...(p.entity ? { entity: p.entity } : {}), ...(p.entityId ? { entityId: p.entityId } : {}) } }).then(r => r.data);

export interface ReconcileResult { walletId: string; currency: string; expected: number; actual: number; difference: number; matches: boolean; adjusted: boolean; transactionId?: string }
/** Compares the balance with what the real account shows; `adjust` also adds the Balance adjustment that puts it right. */
export const reconcileWallet = (walletId: string, actualBalance: number, adjust = false): Promise<ReconcileResult> =>
  api.post(`/wallets/${walletId}/reconcile`, { actualBalance, adjust }).then(r => r.data);

/** The rows the filter shows, as CSV text (up to 5,000). */
export const getExport = (f: HistoryFilter): Promise<{ csv: string; count: number; truncated: boolean }> =>
  api.get('/transactions/export', { params: feedParams(f) }).then(r => r.data);

/** The same rows as a spreadsheet or a PDF: the file comes back as base64 so the page can save it. */
export const getExportFile = (f: HistoryFilter, format: 'xlsx' | 'pdf'): Promise<{ filename: string; base64: string; count: number; truncated: boolean }> =>
  api.get('/transactions/export/file', { params: feedParams(f, { format }) }).then(r => r.data);

export const getTags = (): Promise<{ items: Array<{ tag: string; count: number }> }> => api.get('/transactions/tags').then(r => r.data);
export const getAnnotation = (id: string): Promise<{ id: string; tags: string[]; note: string | null }> => api.get(`/transactions/${id}/annotate`).then(r => r.data);
export const annotateRow = (id: string, data: { tags?: string[]; note?: string }): Promise<{ id: string; tags: string[]; note: string | null }> => api.patch(`/transactions/${id}/annotate`, data).then(r => r.data);

export const getDuplicateGroups = (): Promise<{ groups: Array<{ id: string; rows: FeedRow[] }>; truncated: boolean }> => api.get('/transactions/duplicates').then(r => r.data);
export const keepDuplicates = (ids: string[]): Promise<{ kept: number }> => api.post('/transactions/duplicates/keep', { ids }).then(r => r.data);
