// Sample answers for the History page (?mock=1): the feed (paged, filtered) and its totals.
// `?many=1` adds 150 more rows to try paging; `?histerr=1` / `?sumerr=1` make the list or the totals fail.
import type { FeedRow } from '@/utils/history';

type Wallet = { id: string; name: string; color: string; currency: string; archived: boolean };
type BaseTx = Record<string, any>;

const walletTag = (w?: Wallet) => (w ? { name: w.name, color: w.color, currency: w.currency, archived: w.archived } : null);

/** Turns the ordinary sample transactions into feed rows, and adds one of every kind History can show. */
/** Tags and notes the person set during this session (the sample data starts with one tag). */
export const annotations: Record<string, { tags: string[]; note: string | null }> = { t4: { tags: ['trip'], note: null } };
const dupKept = new Set<string>();

/** Annotations, the tag list, the duplicate groups and the export file, as the server answers them. */
export function toolsAnswer(method: string, path: string, body: any, rows: () => FeedRow[]): unknown | undefined {
  if (!path.startsWith('/transactions/')) return undefined;
  if (path === '/transactions/tags') {
    const counts = new Map<string, number>();
    for (const a of Object.values(annotations)) for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return { items: [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count) };
  }
  const ann = path.match(/^\/transactions\/([^/]+)\/annotate$/);
  if (ann) {
    const cur = annotations[ann[1]] ?? { tags: [], note: null };
    if (method === 'patch') {
      const tags = body.tags !== undefined ? [...new Set<string>((body.tags as string[]).map(x => String(x).replace(/^#+/, '').trim()).filter(Boolean))].slice(0, 10) : cur.tags;
      annotations[ann[1]] = { tags, note: body.note !== undefined ? (String(body.note).trim() || null) : cur.note };
    }
    return { id: ann[1], ...(annotations[ann[1]] ?? cur) };
  }
  if (path === '/transactions/duplicates' && method === 'get') {
    const first = rows().find(r => r.possibleDuplicate && !gone.has(r.id));
    if (!first || dupKept.has(first.id)) return { groups: [], truncated: false };
    const twin = { ...first, id: first.id + '-copy', date: new Date(new Date(first.date).getTime() + 3_600_000).toISOString() };
    return { groups: gone.has(twin.id) ? [] : [{ id: first.id, rows: [first, twin] }], truncated: false };
  }
  if (path === '/transactions/duplicates/keep' && method === 'post') { for (const id of body.ids ?? []) dupKept.add(String(id)); return { kept: (body.ids ?? []).length }; }
  if (path === '/transactions/export/file' && method === 'get') return { filename: 'history.xlsx', base64: 'UEsDBA==', count: 3, truncated: false };
  return undefined;
}

export function personalFeedRows(transactions: BaseTx[], wallets: Wallet[], iso: (days: number, hour?: number) => string, many: boolean): FeedRow[] {
  const byId = new Map(wallets.map(w => [w.id, w]));
  const row = (t: BaseTx, extra: Partial<FeedRow> = {}): FeedRow => {
    const w = t.walletId ? byId.get(t.walletId) : undefined;
    return { ...t, wallet: walletTag(w), currency: w?.currency ?? null, debt: null, fundedBy: null, schedule: null, transfer: null, ...extra } as FeedRow;
  };
  const base = transactions.map(t => {
    if (t.id === 't9') return row(t, { debt: { person: 'John Mugisha', kind: 'BORROWED', status: 'OPEN', amount: 200_000, paid: 50_000, currency: 'RWF', payments: 2, installments: 5 } });
    if (t.id === 't10') return row(t, { debt: { person: 'Eric Habimana', kind: 'LENT', status: 'OPEN', amount: 120_000, paid: 40_000, currency: 'RWF', payments: 1, installments: 3 } });
    if (t.id === 't12') return row(t, { schedule: { id: 's1', title: 'Rent', repeat: { unit: 'MONTH' }, mode: 'REMIND_CONFIRM', status: 'ACTIVE' } });
    if (t.id === 't1') return row(t, { receiptUrl: 'r1.jpg', receiptReportUrl: 'r1.pdf', subCategory: 'Groceries' });
    if (t.id === 't3') return row(t, { possibleDuplicate: true });
    if (t.id === 't4') return row(t, { subCategory: 'Restaurants', description: 'Two large pizzas and drinks for 6' });
    return row(t);
  });
  const usd = byId.get('w3'), momo = byId.get('w2'), main = byId.get('w1');
  const extras: FeedRow[] = [
    row({ id: 'x1', type: 'TRANSFER', category: 'other', title: 'Top up MoMo', subCategory: null, description: null, amount: 50_000, date: iso(-1, 8), walletId: 'w1', receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null },
      { transfer: { toWalletId: 'w2', toWallet: walletTag(momo), toAmount: 50_000, exchangeRate: null } }),
    row({ id: 'x2', type: 'TRANSFER', category: 'other', title: 'Exchange to dollars', subCategory: null, description: null, amount: 130_000, date: iso(-3, 9), walletId: 'w1', receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null },
      { transfer: { toWalletId: 'w3', toWallet: walletTag(usd), toAmount: 100, exchangeRate: 0.00077 } }),
    row({ id: 'x3', type: 'INCOME', category: 'loan', title: 'Borrowed from Mama', subCategory: null, description: null, amount: 200_000, date: iso(-4, 10), walletId: 'w2', receiptUrl: null, receiptReportUrl: null, debtId: 'd9', debtRole: 'BORROW_IN' },
      { debt: { person: 'Mama K.', kind: 'BORROWED', status: 'OPEN', amount: 200_000, paid: 0, currency: 'RWF', payments: 0, installments: 0 } }),
    row({ id: 'x4', type: 'EXPENSE', category: 'transport', title: 'Taxi to the airport', subCategory: 'Taxi', description: null, amount: -4_500, date: iso(-5, 9), walletId: 'w2', receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null },
      { fundedBy: { debtId: 'd9', person: 'Mama K.' } }),
    row({ id: 'x5', type: 'EXPENSE', category: 'entertainment', title: 'Spotify', subCategory: 'Spotify', description: null, amount: -12.99, date: iso(-2, 0), walletId: 'w3', receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null }),
    row({ id: 'x6', type: 'INCOME', category: 'gifts', title: 'Land sale 🏡 with a very long title that keeps going on and on and wraps', subCategory: null, description: null, amount: 1_250_000_000, date: iso(-6, 11), walletId: 'w1', receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null }),
    row({ id: 'x7', type: 'EXPENSE', category: 'other', title: '', subCategory: null, description: null, amount: -2_000, date: iso(-8, 10), walletId: null, receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null }),
    row({ id: 'x8', type: 'EXPENSE', category: 'bills', title: 'Old gym fee', subCategory: 'Gym membership', description: null, amount: -30_000, date: iso(-10, 10), walletId: 'wOld', receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null },
      { wallet: { name: 'Old Cash', color: '#9AA8AE', currency: 'RWF', archived: true }, currency: 'RWF' }),
  ];
  void main;
  const filler: FeedRow[] = many
    ? Array.from({ length: 150 }, (_, i) => row({ id: `f${i}`, type: 'EXPENSE', category: ['food', 'transport', 'bills', 'shopping'][i % 4], title: `Sample purchase ${i + 1}`, subCategory: null, description: null, amount: -(1000 + i * 37), date: iso(-14 - Math.floor(i / 3), 8 + (i % 10)), walletId: i % 2 ? 'w2' : 'w1', receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null }))
    : [];
  return [...base, ...extras, ...filler].map(r => ({ ...r, tags: annotations[r.id]?.tags ?? [], note: annotations[r.id]?.note ?? null })).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));
}

const KIND: Record<string, (r: FeedRow) => boolean> = {
  income: r => r.type === 'INCOME' && r.debtRole !== 'BORROW_IN', expense: r => r.type === 'EXPENSE',
  transfer: r => r.type === 'TRANSFER', debt: r => r.debtRole === 'BORROW_IN' || r.debtRole === 'REPAY_OUT',
  credit: r => r.debtRole === 'LEND_OUT' || r.debtRole === 'REPAY_IN', scheduled: r => !!r.schedule,
};

const LEGACY: Record<string, string> = { groceries: 'food', fuel: 'transport', travel: 'transport', rent: 'bills', utilities: 'bills', subscriptions: 'bills', personal_care: 'health', education: 'health', family: 'gifts' };
const canon = (c: string) => LEGACY[c] ?? c;
type Pick = { c: string; s?: string; none?: boolean };
const picks = (raw: unknown): Pick[] => { try { const v = JSON.parse(String(raw ?? '[]')); return Array.isArray(v) ? v : []; } catch { return []; } };
const matchPick = (r: FeedRow, p: Pick) => canon(r.category) === canon(p.c) && (p.s ? (r.subCategory ?? '').toLowerCase() === p.s.toLowerCase() : p.none ? !r.subCategory : true);

/** Applies the query the real server understands (kinds, loans switch, wallets, search, categories, amount, receipt, source; an empty past period). */
export function filterRows(all: FeedRow[], params: Record<string, any>, ignoreCategories = false): FeedRow[] {
  const now = new Date();
  // A month that is not this one has nothing in the sample data, so the "empty period" screen can be seen.
  if (params.month && Number(params.month) !== now.getMonth() + 1) return [];
  const ids = params.walletIds ? String(params.walletIds).split(',') : [];
  const kinds = [...String(params.kinds ?? '').split(','), String(params.view ?? '')].filter(k => KIND[k]);
  const q = params.search ? String(params.search).toLowerCase() : '';
  const inc = ignoreCategories ? [] : picks(params.categories), exc = ignoreCategories ? [] : picks(params.excludeCategories);
  const min = params.minAmount !== undefined ? Number(params.minAmount) : null, max = params.maxAmount !== undefined ? Number(params.maxAmount) : null;
  const schedIds = params.schedules ? String(params.schedules).split(',') : [];
  const flags = params.flags ? String(params.flags).split(',') : [];
  const tagList = params.tags ? String(params.tags).split(',') : [];
  return all.filter(r =>
    !gone.has(r.id)
    && (!kinds.length || kinds.some(k => KIND[k](r)))
    && (params.includeLoans !== 'false' || !r.debtRole)
    && (!ids.length || (r.walletId && ids.includes(r.walletId)) || (r.transfer?.toWalletId && ids.includes(r.transfer.toWalletId)))
    && (!q || `${r.title} ${r.description ?? ''} ${r.subCategory ?? ''} ${r.wallet?.name ?? ''} ${r.note ?? ''} ${(r.tags ?? []).join(' ')}`.toLowerCase().includes(q))
    && (!inc.length || inc.some(p => matchPick(r, p)))
    && !exc.some(p => matchPick(r, p))
    && (min === null || Math.abs(r.amount) >= min) && (max === null || Math.abs(r.amount) <= max)
    && (params.receipt !== 'with' || !!r.receiptUrl) && (params.receipt !== 'without' || !r.receiptUrl)
    && (!tagList.length || tagList.some(tg => (r.tags ?? []).map(x => x.toLowerCase()).includes(tg.toLowerCase())))
    && (!schedIds.length || (r.schedule && schedIds.includes(r.schedule.id)))
    && (!flags.length || flags.every(f => (f === 'uncategorised' ? !r.subCategory && canon(r.category) === 'other' : f === 'duplicates' ? !!r.possibleDuplicate : true)))
    && (params.source !== 'schedule' || !!r.schedule) && (params.source !== 'debt' || !!r.debtId) && (params.source !== 'transfer' || r.type === 'TRANSFER')
    && (params.source !== 'hand' || (!r.schedule && !r.debtId && r.type !== 'TRANSFER')));
}

/** The used categories and sub-categories, counted over everything but the category choice itself. */
export function facetsAnswer(all: FeedRow[], params: Record<string, any>): unknown {
  const rows = filterRows(all, params, true).filter(r => r.type === 'INCOME' || r.type === 'EXPENSE');
  const map = new Map<string, any>();
  for (const r of rows) {
    const kind = r.type === 'INCOME' ? 'INCOME' : 'EXPENSE', c = canon(r.category), key = kind + ':' + c;
    const cat = map.get(key) ?? { category: c, kind, count: 0, lastUsed: null, noSub: 0, subs: [] as any[] };
    cat.count++;
    if (!cat.lastUsed || r.date > cat.lastUsed) cat.lastUsed = r.date;
    const name = r.subCategory;
    if (!name) cat.noSub++;
    else { const sub = cat.subs.find((x: any) => x.name.toLowerCase() === name.toLowerCase()); if (sub) { sub.count++; if (r.date > sub.lastUsed) sub.lastUsed = r.date; } else cat.subs.push({ name, count: 1, lastUsed: r.date }); }
    map.set(key, cat);
  }
  const categories = [...map.values()].map(c => ({ ...c, subs: c.subs.sort((a: any, b: any) => b.count - a.count) })).sort((a, b) => b.count - a.count);
  return { total: rows.length, categories };
}

export function feedAnswer(all: FeedRow[], params: Record<string, any>): unknown {
  if (params.__histerr) return { __error: { status: 500, data: { message: 'mock failure' } } };
  const rows = filterRows(all, params);
  if (params.sort === 'oldest') rows.sort((x, y) => (x.date < y.date ? -1 : 1));
  else if (params.sort === 'largest') rows.sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount));
  else if (params.sort === 'smallest') rows.sort((x, y) => Math.abs(x.amount) - Math.abs(y.amount));
  const start = params.cursor ? Number(params.cursor) : 0;
  const limit = Number(params.limit) || 40;
  const items = rows.slice(start, start + limit);
  return { items, nextCursor: start + limit < rows.length ? String(start + limit) : null };
}

export function summaryAnswer(all: FeedRow[], params: Record<string, any>, fallback = 'RWF'): unknown {
  if (params.__sumerr) return { __error: { status: 500, data: { message: 'mock failure' } } };
  const rows = filterRows(all, params);
  const cur = new Map<string, { currency: string; income: number; expense: number; net: number; count: number; series: number[]; previous: { income: number; expense: number } | null; spendingChangePct: number | null }>();
  for (const r of rows) {
    const c = r.wallet?.currency ?? r.currency ?? fallback;
    const t = cur.get(c) ?? { currency: c, income: 0, expense: 0, net: 0, count: 0, series: [4, 7, 3, 9, 6, 12, 8, 14, 10, 16, 11, 18], previous: null, spendingChangePct: null };
    t.count++;
    if (r.type === 'INCOME' && r.debtRole !== 'BORROW_IN') t.income += r.amount;
    if (r.type === 'EXPENSE') t.expense += -r.amount;
    cur.set(c, t);
  }
  const currencies = [...cur.values()].map(t => {
    const previous = params.all ? null : { income: Math.round(t.income * 0.9), expense: Math.round(t.expense * 0.8) };
    return { ...t, net: Math.round((t.income - t.expense) * 100) / 100, previous, spendingChangePct: previous && previous.expense > 0 ? Math.round(((t.expense - previous.expense) / previous.expense) * 100) : null };
  }).sort((a, b) => b.count - a.count);
  const converted = params.convertTo && currencies.length
    ? (() => { const rate: Record<string, number> = { RWF: 1, USD: 1300 }; const income = Math.round(currencies.reduce((s, c) => s + c.income * (rate[c.currency] ?? 0), 0)); const expense = Math.round(currencies.reduce((s, c) => s + c.expense * (rate[c.currency] ?? 0), 0)); return { currency: params.convertTo, income, expense, net: income - expense, missing: [] as string[] }; })()
    : null;
  return { period: { kind: params.all ? 'all' : 'month', from: null, to: null }, count: rows.length, currencies, converted };
}

/** One header per category, wallet, member or title with totals for the whole filter. */
export function groupsAnswer(all: FeedRow[], params: Record<string, any>, fallback = 'RWF'): unknown {
  const rows = filterRows(all, params);
  const by = String(params.groupBy ?? 'category');
  const map = new Map<string, { key: string; count: number; totals: Map<string, { currency: string; income: number; expense: number }> }>();
  for (const r of rows) {
    const key = by === 'wallet' ? r.walletId ?? '—' : by === 'title' ? r.title : by === 'member' ? 'me' : canon(r.category);
    const g = map.get(key) ?? { key, count: 0, totals: new Map() };
    const cur = r.wallet?.currency ?? r.currency ?? fallback;
    const t = g.totals.get(cur) ?? { currency: cur, income: 0, expense: 0 };
    g.count++;
    if (r.type === 'INCOME' && r.debtRole !== 'BORROW_IN') t.income += r.amount;
    if (r.type === 'EXPENSE') t.expense += -r.amount;
    g.totals.set(cur, t); map.set(key, g);
  }
  return { groupBy: by, groups: [...map.values()].map(g => ({ key: g.key, count: g.count, totals: [...g.totals.values()] })) };
}

export function suggestAnswer(all: FeedRow[], q: string): unknown {
  const low = q.toLowerCase();
  const counts = new Map<string, number>();
  for (const r of all) if (r.title.toLowerCase().includes(low)) counts.set(r.title, (counts.get(r.title) ?? 0) + 1);
  const people = [...new Set(all.map(r => r.debt?.person).filter((p): p is string => !!p && p.toLowerCase().includes(low)))];
  return { titles: [...counts].map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count).slice(0, 5), people };
}

const savedViews: Array<{ id: string; name: string; filter: unknown; createdAt: string; mine: boolean }> = [];
/** Saved views, kept in memory for the session (names unique, at most 30). */
export function viewsAnswer(method: string, path: string, body: any): unknown {
  const id = path.split('/')[3];
  if (method === 'get') return savedViews;
  const taken = (name: string, except?: string) => savedViews.some(v => v.id !== except && v.name.toLowerCase() === name.toLowerCase());
  if (method === 'post') {
    if (!body.name || taken(body.name)) return { __error: { status: 409, data: { message: 'exists' } } };
    if (savedViews.length >= 30) return { __error: { status: 400, data: { message: 'Too many saved views' } } };
    const v = { id: 'v' + (savedViews.length + 1) + Date.now(), name: body.name, filter: body.filter, createdAt: new Date().toISOString(), mine: true };
    savedViews.unshift(v); return v;
  }
  const i = savedViews.findIndex(v => v.id === id);
  if (i < 0) return { __error: { status: 404, data: { message: 'Not found' } } };
  if (method === 'patch') { if (taken(body.name, id)) return { __error: { status: 409, data: { message: 'exists' } } }; savedViews[i] = { ...savedViews[i], name: body.name }; return savedViews[i]; }
  savedViews.splice(i, 1); return { success: true };
}

// ── Select mode and Recently deleted (kept in memory for the session) ──
const trash: Array<{ id: string; row: FeedRow; deletedAt: string }> = [];
const gone = new Set<string>();
export function trashAnswer(method: string, path: string, body: any, all: FeedRow[]): unknown {
  const one = method === 'delete' && path.match(/^\/transactions\/([^/]+)$/);
  if (one && one[1] !== 'bulk') return trashAnswer('post', '/transactions/bulk', { ids: [one[1]], action: 'delete' }, all) && { success: true, trashId: 'tr-' + one[1] };
  if (path === '/transactions/bulk') {
    const ids: string[] = body.ids ?? [];
    const out = { done: [] as string[], failed: [] as Array<{ id: string; reason: string }>, trashIds: [] as string[] };
    for (const id of ids) {
      const r = all.find(x => x.id === id);
      if (!r) { out.failed.push({ id, reason: 'Transaction not found' }); continue; }
      if (r.debtId) { out.failed.push({ id, reason: 'This was recorded by Debts & loans — change it there.' }); continue; }
      if (body.action !== 'delete' && r.type === 'TRANSFER') { out.failed.push({ id, reason: 'Transfers cannot be edited. Delete it and make a new transfer.' }); continue; }
      if (body.action === 'delete') { const tid = 'tr-' + id; trash.unshift({ id: tid, row: r, deletedAt: new Date().toISOString() }); gone.add(id); out.trashIds.push(tid); }
      else if (body.action === 'category') (r as any).category = body.category;
      out.done.push(id);
    }
    return out;
  }
  const g = path.match(/^\/transactions\/trash(?:\/([^/]+?)(?:\/(restore))?)?$/);
  if (!g) return undefined;
  if (method === 'get' && !g[1]) {
    return { days: 30, items: trash.map(x => ({ id: x.id, title: x.row.title, type: x.row.type, category: x.row.category, subCategory: x.row.subCategory ?? null, amount: Math.abs(x.row.amount), currency: x.row.wallet?.currency ?? null, date: x.row.date, deletedAt: x.deletedAt, expiresAt: new Date(Date.parse(x.deletedAt) + 30 * 86_400_000).toISOString(), mine: true })) };
  }
  const i = trash.findIndex(x => x.id === g[1]);
  if (i < 0) return { __error: { status: 404, data: { message: 'That item is no longer in Recently deleted' } } };
  if (g[2] === 'restore') gone.delete(trash[i].row.id);
  const id = trash[i].row.id;
  trash.splice(i, 1);
  return { success: true, transactionId: id };
}
export const isGone = (id: string) => gone.has(id);

// ── Wallet statement and running balance ──
const effectOn = (r: FeedRow, walletId: string): number => {
  const raw = Math.abs(r.amount);
  if (r.type === 'TRANSFER') return r.walletId === walletId ? -raw : r.transfer?.toWalletId === walletId ? (r.transfer.toAmount ?? raw) : 0;
  if (r.walletId !== walletId) return 0;
  return r.type === 'INCOME' ? raw : -raw;
};
const touches = (r: FeedRow, id: string) => r.walletId === id || r.transfer?.toWalletId === id;

export function statementAnswer(all: FeedRow[], wallets: Array<{ id: string; name: string; color: string; currency: string; balance: number; archived?: boolean }>, params: Record<string, any>): unknown {
  const id = String(params.walletIds ?? '');
  const w = wallets.find(x => x.id === id);
  if (!w) return { __error: { status: 404, data: { message: 'Wallet not found' } } };
  const mine = all.filter(r => touches(r, id));
  const inPeriod = filterRows(mine, { month: params.month, year: params.year, all: params.all });
  const after = mine.filter(r => !inPeriod.includes(r) && r.date > (inPeriod[0]?.date ?? '9'));
  const before = (a: FeedRow[]) => a.reduce((n, r) => n + effectOn(r, id), 0);
  const income = inPeriod.filter(r => r.type === 'INCOME' && r.walletId === id).reduce((n, r) => n + r.amount, 0);
  const spending = inPeriod.filter(r => r.type === 'EXPENSE' && r.walletId === id).reduce((n, r) => n - r.amount, 0);
  const tin = inPeriod.filter(r => r.type === 'TRANSFER' && r.transfer?.toWalletId === id).reduce((n, r) => n + (r.transfer?.toAmount ?? Math.abs(r.amount)), 0);
  const tout = inPeriod.filter(r => r.type === 'TRANSFER' && r.walletId === id).reduce((n, r) => n + Math.abs(r.amount), 0);
  const closing = w.balance - before(after);
  const opening = closing - (income + tin - spending - tout);
  return {
    wallet: { id: w.id, name: w.name, color: w.color, currency: w.currency, archived: !!w.archived, balance: w.balance },
    period: { from: null, to: null }, opening, in: income + tin, out: spending + tout, closing,
    parts: { income, transfersIn: tin, spending, transfersOut: tout }, count: inPeriod.length, balanced: true,
  };
}

/** Adds "balance after" to a list that shows one wallet's whole timeline, the way the real server does. */
export function withBalances(all: FeedRow[], wallets: Array<{ id: string; balance: number }>, params: Record<string, any>, items: FeedRow[]): FeedRow[] {
  const id = params.walletIds && !String(params.walletIds).includes(',') ? String(params.walletIds) : '';
  const plain = id && !params.kinds && !params.search && !params.categories && !params.excludeCategories && params.minAmount === undefined && params.maxAmount === undefined
    && !params.receipt && !params.source && !params.schedules && !params.flags && params.includeLoans !== 'false' && !params.groupBy && !params.sort;
  const w = wallets.find(x => x.id === id);
  if (!plain || !w || !items.length) return items;
  const newer = all.filter(r => touches(r, id) && r.date > items[0].date);
  let running = w.balance - newer.reduce((n, r) => n + effectOn(r, id), 0);
  return items.map(r => { const out = { ...r, balanceAfter: running }; running -= effectOn(r, id); return out; });
}

/** A few Activity lines: an edit with before → after, a delete that can be restored, a wallet change, a transfer. */
export function activityAnswer(params: Record<string, any>, iso: (offsetDays: number, hour?: number) => string) {
  const all = [
    { id: 'a1', kind: 'transaction.edited', entity: 'transaction', entityId: 't2', title: 'Moto to town', amount: 3000, currency: 'RWF', changes: [{ field: 'amount', from: 2500, to: 3000 }, { field: 'title', from: 'Moto', to: 'Moto to town' }], createdAt: iso(0, 9), trashId: null },
    { id: 'a2', kind: 'transaction.deleted', entity: 'transaction', entityId: 't9', title: 'Old snack', amount: 800, currency: null, changes: null, createdAt: iso(-1, 18), trashId: 'tr1' },
    { id: 'a3', kind: 'wallet.edited', entity: 'wallet', entityId: 'w2', title: 'MoMo', amount: null, currency: 'RWF', changes: [{ field: 'name', from: 'MTN', to: 'MoMo' }], createdAt: iso(-2, 11), trashId: null },
    { id: 'a4', kind: 'wallet.transfer', entity: 'wallet', entityId: 'w1', title: 'Main account → MoMo', amount: 50000, currency: 'RWF', changes: null, createdAt: iso(-3, 8), trashId: null },
    { id: 'a5', kind: 'transaction.created', entity: 'transaction', entityId: 't1', title: 'Salary', amount: 250000, currency: 'RWF', changes: null, createdAt: iso(-4, 7), trashId: null },
    { id: 'a6', kind: 'debt.payment', entity: 'debt', entityId: 'd1', title: 'John', amount: 20000, currency: 'RWF', changes: null, createdAt: iso(-5, 10), trashId: null },
  ].filter(e => (!params.entity || e.entity === params.entity) && (!params.entityId || e.entityId === params.entityId));
  const start = params.cursor ? Number(String(params.cursor).split('|')[1]) || 0 : 0;
  const page = all.slice(start, start + 4);
  return { since: iso(-5, 10), week: { total: 5, added: 1, changed: 3, deleted: 1 }, next: start + 4 < all.length ? `x|${start + 4}` : null, items: page };
}
