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

/** Answers a request about families, or in a family. `undefined` means "not mine": the ordinary sample data answers. */
export function respondFamily(method: string, path: string, params: Record<string, any>, body: Record<string, any>, familyHeader: string | undefined): unknown | undefined {
  const m = method.toLowerCase();
  let g: RegExpMatchArray | null;

  // ── The family routes ──
  if (path === '/family/mine') {
    return hasFamily() ? { family: MOCK_FAMILY, role: mockRole(), memberCount: members().length, limits: { maxMembers: 12, maxPendingInvites: 20, inviteDays: 7 } } : '';
  }
  if (path === '/family' && m === 'post') { remember('nofamily', '0'); return { family: { ...MOCK_FAMILY, name: body.name ?? MOCK_FAMILY.name, currency: body.currency ?? 'RWF' }, role: 'OWNER' }; }
  if (path === '/family/invites/preview') {
    if (hasFamily()) return fail(409, 'ALREADY_IN_FAMILY', 'Leave your current family first');
    const code = String(params.code ?? '').toUpperCase();
    if (code === MOCK_CODE || params.token) return { family: { id: MOCK_FAMILY.id, name: MOCK_FAMILY.name }, invitedBy: 'Aline Uwase', role: 'MEMBER', expiresAt: iso(6) };
    return fail(404, 'INVITE_NOT_FOUND', 'No invite matches that code');
  }
  if (path === '/family/join' && m === 'post') {
    if (hasFamily()) return fail(409, 'ALREADY_IN_FAMILY', 'Leave your current family first');
    remember('nofamily', '0');
    return { family: MOCK_FAMILY, role: 'MEMBER' };
  }
  if ((g = path.match(/^\/family\/([^/]+)\/members$/))) return members();
  if ((g = path.match(/^\/family\/([^/]+)\/invites$/))) {
    if (m === 'post') return { id: 'inv_new', code: 'AB23CD', token: 'mocktokenmocktokenmocktoken', link: 'https://aby-expense.onrender.com/join/mocktokenmocktokenmocktoken', role: body.role ?? 'MEMBER', expiresAt: iso(7), phone: null, email: null };
    return [{ id: 'inv1', code: MOCK_CODE, role: 'MEMBER', phone: null, email: null, invitedBy: ME, createdAt: iso(-1), expiresAt: iso(6) }];
  }
  if ((g = path.match(/^\/family\/([^/]+)\/activity$/))) return activity();
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
    loans: { out: 0, in: 0, borrowed: 0 }, owe: {}, owed: {}, scheduled: { waiting: 0, next: null }, attention: [], attentionTotal: 0,
    netWorth: [{ currency: 'RWF', wallets: 600_000, owed: 0, owe: 0, total: 600_000 }],
  };
  return undefined;
}
