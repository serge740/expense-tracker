/**
 * Sample family data for the offline preview (?mock=1) so the family screens can be looked at, screenshotted and
 * click-tested without a backend. Development and screenshot builds only; a normal build never loads this.
 *
 *   ?mock=1&role=MEMBER       the signed-in person's role in the family (OWNER by default)
 *   ?mock=1&nofamily=1        a person with no family yet (create / join screens)
 *
 * The code K7M2QX is a valid invite; any other code is "not found".
 */
export const MOCK_FAMILY = { id: 'fam_mock_123456', name: 'Mwiza Family', currency: 'RWF', timezone: 'Africa/Kigali' };
export const MOCK_CODE = 'K7M2QX';

const iso = (days: number, hour = 12) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const flag = (name: string) => { try { return new URLSearchParams(location.search).get(name) ?? sessionStorage.getItem('mock_' + name); } catch { return null; } };
const remember = (name: string, value: string) => { try { sessionStorage.setItem('mock_' + name, value); } catch { /* ignore */ } };

export const mockRole = (): 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' => {
  const r = (flag('role') ?? 'OWNER').toUpperCase();
  const role = (['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'].includes(r) ? r : 'OWNER') as 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  remember('role', role);
  return role;
};
const hasFamily = () => { const v = flag('nofamily'); if (v) remember('nofamily', v); return !(v === '1'); };

import { facetsAnswer, feedAnswer, summaryAnswer } from './mock-history';

const ME = 'mock_me';
const members = () => {
  const role = mockRole();
  return [
    { clientId: ME, role, nickname: null, name: 'Aline Uwase', profileImage: null, joinedAt: iso(-30), isYou: true },
    { clientId: 'm_eric', role: role === 'OWNER' ? 'ADMIN' : 'OWNER', nickname: null, name: 'Eric Uwase', profileImage: null, joinedAt: iso(-29), isYou: false },
    { clientId: 'm_grace', role: 'MEMBER', nickname: null, name: 'Grace Uwase', profileImage: null, joinedAt: iso(-12), isYou: false },
    { clientId: 'm_kevin', role: 'VIEWER', nickname: null, name: 'Kevin Uwase', profileImage: null, joinedAt: iso(-3), isYou: false },
  ];
};

const wallets = [
  { id: 'fw1', name: 'Household', bank: 'Cash', currency: 'RWF', balance: 480_000, color: 'teal', walletType: 'CASH', last4: null, accountNumber: null, accountHolder: null, archived: false, isDefault: true },
  { id: 'fw2', name: 'School fees', bank: 'MoMo', currency: 'RWF', balance: 120_000, color: 'blue', walletType: 'MOBILE_MONEY', last4: null, accountNumber: null, accountHolder: null, archived: false, isDefault: false },
];
const author = (who: 'me' | 'grace' | 'eric') => who === 'me' ? { clientId: ME, name: 'Aline Uwase', isYou: true } : who === 'grace' ? { clientId: 'm_grace', name: 'Grace Uwase', isYou: false } : { clientId: 'm_eric', name: 'Eric Uwase', isYou: false };
const tx = (id: string, title: string, amount: number, category: string, days: number, who: 'me' | 'grace' | 'eric') => ({
  id, type: amount < 0 ? 'EXPENSE' : 'INCOME', category, title, subCategory: null, description: null, amount, date: iso(days, 10), walletId: 'fw1',
  receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null, author: author(who),
});
const transactions = () => [
  tx('ft1', 'Simba Supermarket', -42_300, 'food', 0, 'grace'), tx('ft2', 'Electricity', -25_000, 'bills', -1, 'eric'),
  tx('ft3', 'Rent share', 300_000, 'salary', -2, 'me'), tx('ft4', 'Market', -18_000, 'food', -3, 'grace'), tx('ft5', 'Fuel', -30_000, 'transport', -4, 'eric'),
];

const activity = () => [
  { id: 'a1', action: 'member.joined', createdAt: iso(-3, 9), meta: { role: 'VIEWER' }, actor: { clientId: 'm_kevin', name: 'Kevin Uwase' }, target: { clientId: 'm_kevin', name: 'Kevin Uwase' } },
  { id: 'a2', action: 'member.role_changed', createdAt: iso(-12, 9), meta: { from: 'MEMBER', to: 'ADMIN' }, actor: { clientId: ME, name: 'Aline Uwase' }, target: { clientId: 'm_eric', name: 'Eric Uwase' } },
  { id: 'a3', action: 'family.created', createdAt: iso(-30, 9), meta: null, actor: { clientId: ME, name: 'Aline Uwase' }, target: null },
];

export interface MockError { __error: { status: number; data: Record<string, unknown> } }
const fail = (status: number, code: string, message: string): MockError => ({ __error: { status, data: { statusCode: status, code, message } } });

const MOCK_GOALS: Array<{ id: string; name: string; target: number; contributed: number }> = [{ id: 'g1', name: 'New roof', target: 400_000, contributed: 150_000 }];
const MOCK_COMMENTS: Array<{ id: string; body: string; createdAt: string; author: { clientId: string; name: string; isYou: boolean } }> = [{ id: 'c1', body: 'Was this the big bag?', createdAt: iso(-1), author: { clientId: 'u2', name: 'Eric Mwiza', isYou: false } }];

const MOCK_APPR: { threshold: number | null; rows: any[] } = { threshold: 50_000, rows: [{ id: 'ap1', title: 'New sofa', amount: 120_000, status: 'PENDING', createdAt: iso(-1), decidedAt: null, reason: null, category: 'shopping', requestedBy: { clientId: 'u2', name: 'Eric Mwiza' }, decidedBy: null }] };
const MOCK_ALLOW: Record<string, number> = { u1: 100_000 };
const status = (limit: number, spent: number) => ({ limit, spent, left: limit - spent, percent: Math.floor((spent / limit) * 100), over: spent > limit });

/** Answers a request about families, or in a family. `undefined` means "not mine": the ordinary sample data answers. */
export function respondFamily(method: string, path: string, params: Record<string, any>, body: Record<string, any>, familyHeader: string | undefined): unknown | undefined {
  const m = method.toLowerCase();
  let g: RegExpMatchArray | null;

  // ── The family routes ──
  if (path === '/family/mine') {
    if (!hasFamily()) return '';
    const limits = { maxMembers: 12, maxPendingInvites: 20, inviteDays: 7, maxFamilies: 3 };
    const first = { family: MOCK_FAMILY, role: mockRole(), memberCount: members().length, limits };
    const many = flag('many') === '1';
    if (many) remember('many', '1');
    return many ? { ...first, families: [first, { family: { ...MOCK_FAMILY, id: 'fam_mock_second', name: 'Office Family' }, role: 'ADMIN', memberCount: 4, limits }] } : first;
  }
  if (path === '/family' && m === 'post') { remember('nofamily', '0'); return { family: { ...MOCK_FAMILY, name: body.name ?? MOCK_FAMILY.name, currency: body.currency ?? 'RWF' }, role: 'OWNER' }; }
  if (path === '/family/invites/preview') {
    const code = String(params.code ?? '').toUpperCase();
    if (code === MOCK_CODE || params.token) return { family: { id: MOCK_FAMILY.id, name: MOCK_FAMILY.name }, invitedBy: 'Aline Uwase', role: 'MEMBER', expiresAt: iso(6) };
    return fail(404, 'INVITE_NOT_FOUND', 'No invite matches that code');
  }
  if (path === '/family/join' && m === 'post') {
    remember('nofamily', '0');
    return { family: MOCK_FAMILY, role: 'MEMBER' };
  }
  if ((g = path.match(/^\/family\/([^/]+)\/members$/))) return members();
  if ((g = path.match(/^\/family\/([^/]+)\/invites$/))) {
    if (m === 'post') return { id: 'inv_new', code: 'AB23CD', token: 'mocktokenmocktokenmocktoken', link: 'https://aby-expense.onrender.com/join/mocktokenmocktokenmocktoken', role: body.role ?? 'MEMBER', expiresAt: iso(7), phone: null, email: null };
    return [{ id: 'inv1', code: MOCK_CODE, role: 'MEMBER', phone: null, email: null, invitedBy: ME, createdAt: iso(-1), expiresAt: iso(6) }];
  }
  if ((g = path.match(/^\/family\/([^/]+)\/activity$/))) return activity();
  if ((g = path.match(/^\/family\/([^/]+)\/approvals(?:\/(settings|[^/]+)(?:\/(approve|reject))?)?$/))) {
    const decide = mockRole() === 'OWNER' || mockRole() === 'ADMIN';
    if (g[2] === 'settings') { if (m === 'put') MOCK_APPR.threshold = body?.threshold == null ? null : Number(body.threshold); return { threshold: MOCK_APPR.threshold, canManage: mockRole() === 'OWNER', canDecide: decide }; }
    if (g[3] === 'approve' || g[3] === 'reject') { const r = MOCK_APPR.rows.find(x => x.id === g![2]); if (r) { r.status = g[3] === 'approve' ? 'APPROVED' : 'REJECTED'; r.reason = body?.reason ?? null; } return { success: true }; }
    if (m === 'delete' && g[2]) { MOCK_APPR.rows = MOCK_APPR.rows.filter(x => x.id !== g![2]); return { success: true }; }
    return { canDecide: decide, items: MOCK_APPR.rows.map(x => ({ ...x })) };
  }
  if ((g = path.match(/^\/family\/([^/]+)\/transfers\/(options|contribute|reimburse)$/))) {
    const role = mockRole();
    if (g[2] === 'options') {
      return {
        canContribute: role !== 'VIEWER', canReimburse: role === 'OWNER' || role === 'ADMIN', currency: 'RWF',
        personalWallets: role === 'VIEWER' ? [] : [{ id: 'pw1', name: 'My MoMo', currency: 'RWF', balance: 200_000 }],
        familyWallets: wallets.map(w => ({ id: w.id, name: w.name, currency: w.currency, balance: w.balance })),
        members: role === 'OWNER' || role === 'ADMIN' ? [{ clientId: 'u2', name: 'Eric Mwiza', isYou: false }] : [],
      };
    }
    return { groupId: 'grp1', amount: Number(body.amount), currency: 'RWF' };
  }
  if ((g = path.match(/^\/family\/([^/]+)\/allowances\/mine$/))) return MOCK_ALLOW.u1 ? status(MOCK_ALLOW.u1, 90_000) : { none: true };
  if ((g = path.match(/^\/family\/([^/]+)\/allowances(?:\/([^/]+))?$/))) {
    if (m === 'put' && g[2]) MOCK_ALLOW[g[2]] = Number(body.limit);
    if (m === 'delete' && g[2]) delete MOCK_ALLOW[g[2]];
    const rows = [['u1', 'Aline Uwase', 'OWNER', true, 90_000], ['u2', 'Eric Mwiza', 'MEMBER', false, 30_000]] as const;
    return { canManage: mockRole() === 'OWNER' || mockRole() === 'ADMIN', items: rows.map(([id, name, role, isYou, spent]) => ({ clientId: id, name, role, isYou, ...(MOCK_ALLOW[id] ? status(MOCK_ALLOW[id], spent) : { limit: null, spent, left: null, percent: 0, over: false }) })) };
  }
  if ((g = path.match(/^\/family\/([^/]+)\/goals(?:\/([^/]+))?(?:\/contributions)?$/))) {
    const shape = (x: any) => { const saved = x.contributed; return { id: x.id, name: x.name, target: x.target, targetDate: null, status: 'ACTIVE', createdAt: iso(-3), saved, fromContributions: saved, fromWallet: 0, percent: Math.min(100, Math.floor((saved / x.target) * 100)), reached: saved >= x.target, wallet: null }; };
    if (m === 'get') return { items: MOCK_GOALS.map(shape) };
    if (m === 'post' && !g[2]) { MOCK_GOALS.unshift({ id: 'g' + (MOCK_GOALS.length + 1), name: body.name, target: Number(body.target), contributed: 0 }); return shape(MOCK_GOALS[0]); }
    if (m === 'post' && g[2]) { const x: any = MOCK_GOALS.find(y => y.id === g![2]); if (x) x.contributed += Number(body.amount); return shape(x); }
    if (m === 'delete' && g[2]) { const i = MOCK_GOALS.findIndex(y => y.id === g![2]); if (i >= 0) MOCK_GOALS.splice(i, 1); return { success: true }; }
  }
  if ((g = path.match(/^\/family\/([^/]+)\/transactions\/([^/]+)\/comments$/))) {
    if (m === 'post') MOCK_COMMENTS.push({ id: 'c' + (MOCK_COMMENTS.length + 1), body: String(body.body), createdAt: iso(0), author: { clientId: 'u1', name: 'Aline Uwase', isYou: true } });
    return { items: MOCK_COMMENTS };
  }
  if ((g = path.match(/^\/family\/([^/]+)\/comments\/([^/]+)$/)) && m === 'delete') { const i = MOCK_COMMENTS.findIndex(c => c.id === g![2]); if (i >= 0) MOCK_COMMENTS.splice(i, 1); return { success: true }; }
  if (path.startsWith('/family/')) return { success: true };

  // ── Everything else, but asked from inside the family ──
  if (!familyHeader) return undefined;
  if (path === '/wallets') return wallets;
  if (path === '/wallets/summary') return { totalBalance: 600_000, walletCount: 2 };
  if (path === '/wallets/overview') return { base: params.base ?? 'RWF', total: 600_000, yesterday: 585_000, change: 15_000, walletCount: 2, byCurrency: { RWF: 600_000 }, unconverted: [], rates: {}, ratesUpdatedAt: Date.now() };
  if (path === '/wallets/activity') return [];
  if ((g = path.match(/^\/wallets\/([^/]+)$/))) return wallets.find(w => w.id === g![1]) ?? wallets[0];
  if (path === '/transactions/feed' || path === '/transactions/summary' || path === '/transactions/facets') {
    const rows = transactions().map(t => ({ ...t, wallet: { name: 'Household cash', color: '#B45309', currency: 'RWF', archived: false }, currency: 'RWF', debt: null, fundedBy: null, schedule: null, transfer: null })) as any[];
    const list = params.memberId ? rows.filter(r => r.author.clientId === params.memberId) : rows;
    if (path === '/transactions/facets') return facetsAnswer(list, params);
    return path === '/transactions/feed' ? feedAnswer(list, params) : summaryAnswer(list, params);
  }
  if (path === '/transactions/recent') return transactions().slice(0, Number(params.limit) || 3);
  if (path === '/transactions/history') return [{ date: 'TODAY', items: transactions().slice(0, 2) }, { date: 'EARLIER', items: transactions().slice(2) }];
  if (path === '/transactions') { const list = params.memberId ? transactions().filter(t => t.author.clientId === params.memberId) : transactions(); return { data: list, total: list.length, page: 1, limit: 20 }; }
  if (path === '/budget/current') return { limit: 1_000_000, spent: 550_000, remaining: 450_000, percentage: 55, month: new Date().getMonth() + 1, year: new Date().getFullYear() };
  if (path === '/home/summary') return {
    month: new Date().getMonth() + 1, year: new Date().getFullYear(), includeLoans: true, totals: { income: 1_000_000, expense: 550_000, net: 450_000 },
    loans: { out: 0, in: 0, borrowed: 0 }, owe: {}, owed: {}, scheduled: { waiting: 0, next: null }, schedule: { upcoming: [], more: 0, last: null, scheduleCount: 0 }, attention: [], attentionTotal: 0,
    netWorth: [{ currency: 'RWF', wallets: 600_000, owed: 0, owe: 0, total: 600_000 }],
  };
  return undefined;
}

