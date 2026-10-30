/**
 * Development only. Replaces the network with sample data so every screen can be looked at without a backend
 * or a database: open any address with ?mock=1 (remembered for the tab). Never part of a production build.
 */
import { respondFamily, type MockError } from './mock-family';
import { activityAnswer, toolsAnswer, facetsAnswer, feedAnswer, groupsAnswer, personalFeedRows, statementAnswer, suggestAnswer, summaryAnswer, trashAnswer, viewsAnswer, withBalances } from './mock-history';
import api from '@/lib/api';
import { storage } from '@/lib/storage';
import { endpointHash } from '@/lib/push';

const day = 86_400_000;
const now = Date.now();
const iso = (offsetDays: number, hour = 10) => {
  const d = new Date(now + offsetDays * day);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
};

const me = {
  id: 'u1', firstName: 'Aline', lastName: 'Uwase', email: 'aline@example.com', phone: '+250788123456', googleId: null, appleId: null, facebookId: null,
  isVerified: true, emailVerifiedAt: iso(-30), phoneVerifiedAt: null, profileImage: null, isActive: true, isBiometric: false,
  createdAt: iso(-90), updatedAt: iso(-1),
};

const wallets = [
  { id: 'w1', name: 'Main account', bank: 'Bank of Kigali', last4: '4821', accountHolder: 'Aline Uwase', accountNumber: null, color: '#0F2F3A', walletType: 'CHECKING', balance: 1_284_500, currency: 'RWF', archived: false, isDefault: true },
  { id: 'w2', name: 'MoMo', bank: 'MTN', last4: null, accountHolder: null, accountNumber: null, color: '#14532D', walletType: 'MOBILE_MONEY', balance: 86_300, currency: 'RWF', archived: false, isDefault: false },
  { id: 'w3', name: 'Dollar savings', bank: 'Equity', last4: '0092', accountHolder: null, accountNumber: null, color: '#0B3B66', walletType: 'SAVINGS', balance: 920.5, currency: 'USD', archived: false, isDefault: false },
];

type Tx = { id: string; type: 'INCOME' | 'EXPENSE'; category: string; title: string; subCategory: string | null; description: string | null; amount: number; date: string; walletId: string | null; receiptUrl: string | null; receiptReportUrl: string | null; debtId: string | null; debtRole: string | null };
const tx = (id: string, type: Tx['type'], category: string, title: string, amount: number, off: number, walletId: string | null = 'w1', extra: Partial<Tx> = {}): Tx => ({
  id, type, category, title, subCategory: null, description: null, amount: type === 'INCOME' ? amount : -amount, date: iso(off, 8 + (off * -3 + 24) % 12), walletId, receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null, ...extra,
});
const transactions: Tx[] = [
  tx('t1', 'EXPENSE', 'groceries', 'Simba Supermarket', 42_300, 0),
  tx('t2', 'EXPENSE', 'transport', 'Moto to town', 2_500, 0, 'w2'),
  tx('t3', 'INCOME', 'salary', 'October salary', 950_000, -1),
  tx('t4', 'EXPENSE', 'food', 'Lunch at Repub Lounge', 18_000, -1),
  tx('t5', 'EXPENSE', 'utilities', 'EUCL electricity', 25_000, -2, 'w2'),
  tx('t6', 'EXPENSE', 'health', 'Pharmacy', 12_400, -3),
  tx('t7', 'INCOME', 'freelance', 'Logo design for Kigali Tech', 150_000, -4),
  tx('t8', 'EXPENSE', 'entertainment', 'Netflix', 9_000, -5),
  tx('t9', 'EXPENSE', 'loan', 'Paid back John', 50_000, -6, 'w1', { debtId: 'd1', debtRole: 'REPAY_OUT' }),
  tx('t10', 'INCOME', 'loan', 'Eric paid back', 40_000, -7, 'w1', { debtId: 'c1', debtRole: 'REPAY_IN' }),
  tx('t11', 'EXPENSE', 'shopping', 'New shoes', 65_000, -9),
  tx('t12', 'EXPENSE', 'rent', 'Rent — October', 300_000, -12),
];

const debtFull = (o: Record<string, any>): Record<string, any> => ({
  phone: null, writtenOffAmount: 0, spent: 0, unspent: null, dueDate: null, note: null, walletId: null, principalTransactionId: 'p', status: 'OPEN', archived: false,
  overdue: false, remindersOn: true, reminderId: null, reminderStatus: null, nextReminderAt: null, payments: [], installments: [], ...o,
});
const debts = [
  debtFull({
    id: 'd1', kind: 'BORROWED', person: 'John Mugisha', phone: '+250788555111', amount: 200_000, paid: 50_000, remaining: 150_000, spent: 60_000, unspent: 140_000, currency: 'RWF',
    date: iso(-30), dueDate: iso(20), note: 'School fees', nextDueAt: iso(6, 9), reminderId: 'r1', reminderStatus: 'ACTIVE', nextReminderAt: iso(5, 9),
    payments: [{ id: 'p1', amount: 50_000, date: iso(-6), walletId: null, note: null }],
    installments: [
      { id: 'i1', dueAt: iso(-6, 9), plannedAmount: 50_000, status: 'PENDING', view: 'PAID', covered: 50_000, movedFromId: null, note: null },
      { id: 'i2', dueAt: iso(6, 9), plannedAmount: 75_000, status: 'PENDING', view: 'UPCOMING', covered: 0, movedFromId: null, note: null, fromPlan: true },
      { id: 'i3', dueAt: iso(20, 9), plannedAmount: 75_000, status: 'PENDING', view: 'UPCOMING', covered: 0, movedFromId: null, note: null, fromPlan: true },
    ],
    // An estimated payment of 75,000 a month until the loan is paid off
    plan: { amount: 75_000, repeat: { unit: 'MONTH', every: 1, weekdays: [], monthDays: [], nth: null, months: [], ends: { type: 'never' } }, startAt: iso(-6, 9), timezone: 'UTC', finishesAt: iso(20, 9), paymentsLeft: 2, shortfall: 0 },
  }),
  debtFull({ id: 'd2', kind: 'BORROWED', person: 'Marie Claire', amount: 80_000, paid: 0, remaining: 80_000, spent: 0, unspent: 80_000, currency: 'RWF', date: iso(-12), nextDueAt: iso(-2, 9), overdue: true, dueDate: iso(-2) }),
  debtFull({
    id: 'c1', kind: 'LENT', person: 'Eric Habimana', phone: '+250788777222', amount: 120_000, paid: 40_000, remaining: 80_000, currency: 'RWF', walletId: 'w1', date: iso(-20), remindersOn: false,
    payments: [{ id: 'p2', amount: 40_000, date: iso(-7), walletId: 'w1', note: null }],
  }),
  debtFull({ id: 'd3', kind: 'BORROWED', person: 'Cooperative', amount: 30_000, paid: 30_000, remaining: 0, currency: 'RWF', status: 'SETTLED', date: iso(-60) }),
];

const scheduled = [
  { id: 's1', type: 'EXPENSE', category: 'rent', title: 'Rent', subCategory: null, description: null, amount: 300_000, walletId: 'w1', currency: 'RWF', startAt: iso(-60), timezone: 'Africa/Kigali', repeat: { unit: 'MONTH', every: 1, weekdays: [], monthDays: [5], nth: null, months: [], ends: { type: 'never' } }, mode: 'REMIND_CONFIRM', status: 'ACTIVE', nextDueAt: iso(10, 9), waiting: [] },
  { id: 's2', type: 'INCOME', category: 'salary', title: 'Salary', subCategory: null, description: null, amount: 950_000, walletId: 'w1', currency: 'RWF', startAt: iso(-90), timezone: 'Africa/Kigali', repeat: { unit: 'MONTH', every: 1, weekdays: [], monthDays: [28], nth: null, months: [], ends: { type: 'never' } }, mode: 'AUTO_POST', status: 'ACTIVE', nextDueAt: iso(2, 9), waiting: [{ id: 'o1', dueAt: iso(-1, 9), overdue: true }] },
];

/** What is coming: scheduled items and loan / credit pay dates. `?nosched=1` shows the empty case with a last one, `?nosched=2` none ever. */
const agendaItems = () => [
  { key: 'debt:d2', source: 'DEBT', refId: 'd2', occurrenceId: null, title: 'Pay Marie Claire', person: 'Marie Claire', dueAt: iso(-2, 9), overdue: true, waiting: false, failed: false, failReason: null, amount: 80_000, currency: 'RWF', direction: 'OUT' },
  { key: 'occ:o1', source: 'SCHEDULED', refId: 's2', occurrenceId: 'o1', title: 'Salary', person: null, dueAt: iso(-1, 9), overdue: true, waiting: true, failed: false, failReason: null, amount: 950_000, currency: 'RWF', direction: 'IN' },
  { key: 'debt:d1', source: 'DEBT', refId: 'd1', occurrenceId: null, title: 'Pay John Mugisha', person: 'John Mugisha', dueAt: iso(6, 9), overdue: false, waiting: false, failed: false, failReason: null, amount: 75_000, currency: 'RWF', direction: 'OUT' },
  { key: 'sch:s1', source: 'SCHEDULED', refId: 's1', occurrenceId: null, title: 'Rent', person: null, dueAt: iso(10, 9), overdue: false, waiting: false, failed: false, failReason: null, amount: 300_000, currency: 'RWF', direction: 'OUT' },
  { key: 'debt:c1', source: 'CREDIT', refId: 'c1', occurrenceId: null, title: 'Eric Habimana owes you', person: 'Eric Habimana', dueAt: iso(40, 9), overdue: false, waiting: false, failed: false, failReason: null, amount: 80_000, currency: 'RWF', direction: 'IN' },
];
const agendaFor = () => {
  const mode = new URLSearchParams(location.search).get('nosched');
  if (mode === '1') return { items: [], last: { title: 'Rent', at: iso(-12, 9), status: 'POSTED' }, scheduleCount: 2 };
  if (mode === '2') return { items: [], last: null, scheduleCount: 0 };
  return { items: agendaItems(), last: null, scheduleCount: 2 };
};

const homeSummary = {
  month: new Date().getMonth() + 1, year: new Date().getFullYear(), includeLoans: true,
  totals: { income: 1_140_000, expense: 474_200, net: 665_800 },
  loans: { out: 50_000, in: 40_000, borrowed: 0 },
  owe: { RWF: { amount: 230_000, count: 2, overdue: 1, nextDueAt: iso(6, 9) } },
  owed: { RWF: { amount: 80_000, count: 1, overdue: 0, nextDueAt: null } },
  scheduled: { waiting: 1, next: { id: 's2', title: 'Salary', nextDueAt: iso(2, 9) } },
  schedule: { upcoming: [] as any[], more: 0, last: null as any, scheduleCount: 2 },
  attention: [
    { source: 'DEBT', debtId: 'd2', kind: 'BORROWED', person: 'Marie Claire', currency: 'RWF', remaining: 80_000, dueAt: iso(-2, 9), overdue: true },
    { source: 'DEBT', debtId: 'd1', kind: 'BORROWED', person: 'John Mugisha', currency: 'RWF', remaining: 150_000, dueAt: iso(6, 9), overdue: false },
  ],
  attentionTotal: 2,
  netWorth: [
    { currency: 'RWF', wallets: 1_370_800, owed: 80_000, owe: 230_000, total: 1_220_800 },
    { currency: 'USD', wallets: 920.5, owed: 0, owe: 0, total: 920.5 },
  ],
};

const groupByDay = (list: Tx[]) => {
  const groups = new Map<string, Tx[]>();
  for (const t of list) {
    const label = new Date(t.date).toDateString();
    groups.set(label, [...(groups.get(label) ?? []), t]);
  }
  return [...groups.entries()].map(([date, items]) => ({ date, items }));
};

const notifications = [
  { id: 'n1', title: 'Payment due soon', body: 'John Mugisha — 75,000 RWF is due in 6 days.', type: 'reminder', channel: 'in_app', read: false, data: { reminderId: 'r1', debtId: 'd1' }, createdAt: iso(0, 7) },
  { id: 'n2', title: 'New expense', body: '−42,300 · Simba Supermarket', type: 'transaction', channel: 'push', read: false, data: null, createdAt: iso(0, 9) },
  { id: 'n3', title: 'Budget almost used', body: "You've used 82% of this month's budget.", type: 'transaction', channel: 'push', read: true, data: null, createdAt: iso(-2, 12) },
  { id: 'n4', title: 'New sign-in', body: 'Chrome on Windows signed in to your account.', type: 'security', channel: 'in_app', read: true, data: null, createdAt: iso(-3, 18) },
];

const prefs = {
  pushEnabled: true, emailEnabled: true, inAppEnabled: true, timezone: 'Africa/Kigali', language: 'en', quietEnabled: false, quietStart: '22:00', quietEnd: '07:00',
  remindersPush: true, remindersEmail: true, dailyPushCap: 8,
};

const flow = (days: number) => ({
  base: 'RWF', days: Array.from({ length: days }, (_, i) => ({ date: iso(-(days - 1 - i)).slice(0, 10), in: i === 3 ? 150_000 : (i * 37_000) % 60_000, out: ((i + 2) * 21_000) % 55_000 })),
  totalIn: 410_000, totalOut: 268_000,
});

const activity = transactions.slice(0, 8).map(t => ({
  id: t.id, type: t.type, category: t.category, title: t.title, note: null, amount: t.amount, toAmount: null, exchangeRate: null, date: t.date,
  wallet: wallets.find(w => w.id === t.walletId) ? { id: t.walletId!, name: wallets.find(w => w.id === t.walletId)!.name, currency: wallets.find(w => w.id === t.walletId)!.currency } : null, toWallet: null,
}));

const ledger = (kind: string) => {
  const list = debts.filter(d => d.kind === kind);
  const sum = (f: (d: (typeof debts)[number]) => number) => list.reduce((a, d) => a + f(d), 0);
  return {
    kind,
    currencies: [{ currency: 'RWF', taken: sum(d => d.amount as number), paid: sum(d => d.paid as number), writtenOff: 0, remaining: sum(d => d.remaining as number), debtCount: list.length, openCount: list.filter(d => d.status === 'OPEN').length, settledCount: list.filter(d => d.status === 'SETTLED').length, closedOutCount: 0, overdueCount: list.filter(d => d.overdue).length }],
    debtCount: list.length, openCount: list.filter(d => d.status === 'OPEN').length, settledCount: list.filter(d => d.status === 'SETTLED').length, closedOutCount: 0, overdueCount: list.filter(d => d.overdue).length,
  };
};

// Web push: the sample server remembers the browsers that subscribed, so the settings page can be exercised.
const pushDevices: Record<string, any>[] = [];
// A throwaway public key made only for the sample-data mode (it belongs to no server).
const MOCK_VAPID_PUBLIC_KEY = 'BHPeCsryID4PTMcRXxrTwzVCeRzhUlw3JT2WoyzLx99slhZD-BYKrmSKY17vIdqOMeP_jLUFM8bPEP9_As_E8OQ';

async function respondPush(method: string, path: string, body: any): Promise<unknown> {
  const m = method.toLowerCase();
  let g: RegExpMatchArray | null;
  if (path === '/push-notifications/public-key') return { enabled: true, publicKey: MOCK_VAPID_PUBLIC_KEY };
  if (path === '/push-notifications/subscriptions' && m === 'get') return pushDevices;
  if (path === '/push-notifications/subscribe') {
    const hash = await endpointHash(body.endpoint);
    const existing = pushDevices.find(d => d.endpointHash === hash);
    if (existing) { if (body.label) existing.label = body.label; return existing; }
    const device = { id: 'pd' + (pushDevices.length + 1), label: body.label ?? 'Computer', browser: 'Edge 127', os: 'Windows 10/11', deviceType: 'DESKTOP', createdAt: iso(0), lastSeenAt: iso(0), lastSuccessAt: null, lastFailureAt: null, failureCount: 0, endpointHash: hash };
    pushDevices.unshift(device);
    return device;
  }
  if (path === '/push-notifications/unsubscribe/device') { const hash = await endpointHash(body.endpoint); const i = pushDevices.findIndex(d => d.endpointHash === hash); if (i >= 0) pushDevices.splice(i, 1); return { count: 1 }; }
  if (path === '/push-notifications/unsubscribe/all') { pushDevices.length = 0; return { count: 1 }; }
  if ((g = path.match(/^\/push-notifications\/subscriptions\/([^/]+)$/))) {
    const i = pushDevices.findIndex(d => d.id === g![1]);
    if (m === 'patch' && i >= 0) pushDevices[i].label = body.label;
    if (m === 'delete' && i >= 0) pushDevices.splice(i, 1);
    return { ok: true };
  }
  if (path === '/push-notifications/test') return { sent: body?.subscriptionId ? 1 : pushDevices.length, failed: 0, details: [] };
  return { ok: true };
}

function respond(method: string, url: string, params: Record<string, any> = {}, body: any = {}): unknown {
  const path = url.split('?')[0];
  const m = method.toLowerCase();
  let g: RegExpMatchArray | null;

  if ((g = path.match(/^\/wallets\/([^/]+)\/reconcile$/)) && m === 'post') {
    const w: any = (wallets as any[]).find(x => x.id === g![1]); const expected = Number(w?.balance ?? 0); const actual = Number(body.actualBalance); const difference = Math.round((actual - expected) * 100) / 100;
    return { walletId: g[1], currency: w?.currency ?? 'RWF', expected, actual, difference, matches: difference === 0, adjusted: !!body.adjust && difference !== 0 };
  }
  if (path === '/transactions/export' && m === 'get') return { csv: 'Date,Type,Title\r\n2026-10-01,EXPENSE,Lunch\r\n', count: 1, truncated: false };
  if (path === '/activity' && m === 'get') return activityAnswer(params, iso);
  { const tools = toolsAnswer(m, path, body, () => personalFeedRows(transactions, wallets as any, iso, new URLSearchParams(location.search).has('many'))); if (tools !== undefined) return tools; }
  if (path.startsWith('/transactions/views')) return viewsAnswer(m, path, body);
  if (path === '/transactions/bulk' || path.startsWith('/transactions/trash') || (m === 'delete' && /^\/transactions\/[^/]+$/.test(path))) return trashAnswer(m, path, body, personalFeedRows(transactions, wallets as any, iso, new URLSearchParams(location.search).has('many')));
  if (m !== 'get') {
    if (path === '/transactions' && m === 'post') return { id: 'tNew', ...JSON.parse('{}') };
    return { success: true, id: 'ok', message: 'ok' };
  }

  if (path === '/client-auth/me') return me;
  if (path === '/client-auth/passkey') return [];
  if (path === '/wallets') return wallets;
  if (path === '/wallets/summary') return { totalBalance: 1_370_800, walletCount: 3 };
  if (path === '/wallets/overview') return { base: params.base ?? 'RWF', total: 1_483_000, yesterday: 1_455_000, change: 28_000, walletCount: 3, byCurrency: { RWF: 1_370_800, USD: 920.5 }, unconverted: [], rates: { USD: 1_250 }, ratesUpdatedAt: now };
  if (path === '/wallets/flow') return flow(Number(params.days) || 7);
  if (path === '/wallets/activity') return activity;
  if (path === '/wallets/rates') return { base: params.base ?? 'RWF', rates: { USD: 1_250, EUR: 1_380 }, updatedAt: now };
  if (path === '/wallets/quote') return { from: params.from, to: params.to, rate: 0.0008, toAmount: Math.round(Number(params.amount) * 0.0008 * 100) / 100, ratesUpdatedAt: now };
  if ((g = path.match(/^\/wallets\/([^/]+)\/history$/))) return { currency: wallets.find(w => w.id === g![1])?.currency ?? 'RWF', points: Array.from({ length: 30 }, (_, i) => ({ date: iso(-(29 - i)).slice(0, 10), balance: 1_000_000 + i * 9_500 + (i % 5) * 7_000 })) };
  if ((g = path.match(/^\/wallets\/([^/]+)$/))) return wallets.find(w => w.id === g![1]) ?? wallets[0];

  // The person's own subcategories (sample data for the category sheet)
  if (path === '/subcategories') return [
    { id: 's1', kind: 'EXPENSE', category: 'transport', name: 'Boda to market', usageCount: 6, lastUsedAt: new Date(now).toISOString() },
    { id: 's2', kind: 'EXPENSE', category: 'transport', name: 'Moto-taxi', usageCount: 9, lastUsedAt: new Date(now).toISOString() },
    { id: 's3', kind: 'EXPENSE', category: 'food', name: 'Pizza', usageCount: 5, lastUsedAt: new Date(now).toISOString() },
    { id: 's4', kind: 'EXPENSE', category: 'food', name: 'Mama Ntilie', usageCount: 3, lastUsedAt: new Date(now).toISOString() },
    { id: 's5', kind: 'EXPENSE', category: 'bills', name: 'Airtime', usageCount: 4, lastUsedAt: new Date(now).toISOString() },
  ];

  if (path === '/transactions/statement') return statementAnswer(personalFeedRows(transactions, wallets as any, iso, false), wallets as any, params);
  if (path === '/transactions/groups') return groupsAnswer(personalFeedRows(transactions, wallets as any, iso, new URLSearchParams(location.search).has('many')), params);
  if (path === '/transactions/suggest') return suggestAnswer(personalFeedRows(transactions, wallets as any, iso, false), String(params.q ?? ''));
  if (path === '/transactions/feed' || path === '/transactions/summary' || path === '/transactions/facets') {
    const q = new URLSearchParams(location.search);
    const all = personalFeedRows(transactions, wallets as any, iso, q.has('many'));
    if (path === '/transactions/facets') return facetsAnswer(all, params);
    if (path === '/transactions/feed') {
      const page = feedAnswer(all, { ...params, ...(q.has('histerr') ? { __histerr: 1 } : {}) }) as { items?: any[] };
      return page.items ? { ...page, items: withBalances(all, wallets as any, params, page.items) } : page;
    }
    return summaryAnswer(all, { ...params, ...(q.has('sumerr') ? { __sumerr: 1 } : {}) });
  }
  if (path === '/transactions/recent') return transactions.slice(0, Number(params.limit) || 3);
  if (path === '/transactions/history') return groupByDay(transactions);
  if (path === '/transactions') return { data: transactions, total: transactions.length, page: 1, limit: 20 };

  if (path === '/home/summary') {
    const a = agendaFor();
    // The figures follow the period: a quarter of this month for a short range, more for a year, the most for everything.
    const k = params.all ? 4 : params.from ? 0.3 : params.month ? 1 : params.year ? 3.5 : 1;
    const scale = (n: number) => Math.round(n * k);
    return { ...homeSummary, period: { kind: params.all ? 'all' : params.from ? 'range' : params.month ? 'month' : params.year ? 'year' : 'month', from: null, to: null },
      totals: { income: scale(homeSummary.totals.income), expense: scale(homeSummary.totals.expense), net: scale(homeSummary.totals.net) },
      schedule: { upcoming: a.items.slice(0, 2), more: Math.max(0, a.items.length - 2), last: a.items.length ? null : a.last, scheduleCount: a.scheduleCount } };
  }
  if (path === '/home/agenda') return agendaFor();
  if (path === '/budget/current') return { limit: 600_000, spent: 492_000, remaining: 108_000, percentage: 82, month: new Date().getMonth() + 1, year: new Date().getFullYear() };

  if (path === '/reports/summary') return { totalIncome: 1_140_000, totalExpense: 474_200, net: 665_800 };
  if (path === '/reports/monthly') return ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'].map((month, i) => ({ month, year: 2026, total: [310, 420, 380, 510, 450, 474][i] * 1000, heightPct: [55, 75, 68, 100, 85, 90][i] }));
  if (path === '/reports/by-category') return [
    { category: 'rent', label: 'Rent', amount: 300_000, percentage: 63 }, { category: 'groceries', label: 'Groceries', amount: 42_300, percentage: 9 },
    { category: 'food', label: 'Food', amount: 18_000, percentage: 4 }, { category: 'utilities', label: 'Utilities', amount: 25_000, percentage: 5 },
    { category: 'shopping', label: 'Shopping', amount: 65_000, percentage: 14 }, { category: 'other', label: 'Other', amount: 23_900, percentage: 5 },
  ];
  if (path === '/reports/by-member') return [
    { clientId: 'u1', name: 'Aline Uwase', isYou: true, spent: 310_000, earned: 900_000, count: 21, share: 65 },
    { clientId: 'u2', name: 'Eric Mwiza', isYou: false, spent: 164_200, earned: 0, count: 9, share: 35 },
  ];
  if (path === '/reports/top-expenses') return transactions.filter(t => t.amount < 0).slice(0, Number(params.limit) || 4).map(t => ({ ...t, amount: Math.abs(t.amount) }));
  if (path === '/reports/ai-advice') return { verdict: 'fair', summary: 'You spent 82% of your budget with a week to go.', advice: 'Rent is most of your spending, which is normal. Trim shopping this week to stay under budget.', tips: ['Set a weekly shopping limit', 'Move 50,000 to savings after payday', 'Review your subscriptions'] };

  if (path === '/debts') return debts;
  if (path === '/debts/summary') return { owe: { RWF: 230_000 }, owed: { RWF: 80_000 }, openCount: 3, overdue: 1 };
  if (path === '/debts/ledger') return ledger(params.kind === 'LENT' ? 'LENT' : 'BORROWED');
  if (path === '/debts/ledger/transactions') return { data: [], total: 0, page: 1, limit: 30 };
  if ((g = path.match(/^\/debts\/([^/]+)$/))) return debts.find(d => d.id === g![1]) ?? debts[0];

  if (path === '/scheduled') return params.status === 'ENDED' ? [{ ...scheduled[0], id: 's9', title: 'Phone instalment', status: 'ENDED', nextDueAt: null, waiting: [] }] : scheduled;
  if (path === '/scheduled/waiting') return [{ id: 'o1', scheduleId: 's2', dueAt: iso(-1, 9), overdue: true, type: 'INCOME', title: 'Salary', amount: 950_000, category: 'salary', walletId: 'w1', currency: 'RWF' }];
  if ((g = path.match(/^\/scheduled\/([^/]+)$/))) return { ...(scheduled.find(s => s.id === g![1]) ?? scheduled[0]), upcoming: [iso(10, 9), iso(40, 9), iso(70, 9)], history: [{ id: 'h1', dueAt: iso(-20, 9), status: 'POSTED', failReason: null, transactionId: 't12' }] };

  if (path === '/reminders/pending') return new URLSearchParams(location.search).has('reminder') || storage.get('mock_reminder') === '1'
    ? [{ id: 'r1', source: 'DEBT', debtId: 'd2', kind: 'BORROWED', person: 'Marie Claire', currency: 'RWF', remaining: 80_000, dueAt: iso(-2, 9), overdue: true, fireCount: 2, lastFiredAt: iso(0, 7), walletId: null, familyId: new URLSearchParams(location.search).get('reminder') === 'family' ? 'fam_somewhere_else' : null }]
    : [];

  if (path === '/notifications') return { items: notifications, total: notifications.length, unreadCount: notifications.filter(n => !n.read).length, page: 1, limit: 30 };
  if (path === '/notifications/preferences') return prefs;
  if (path === '/devices') return [
    { id: 'dv1', deviceName: 'Chrome on Windows', platform: 'web', ipAddress: '197.243.1.20', lastActiveAt: iso(0, 9), createdAt: iso(-10) },
    { id: 'dv2', deviceName: 'Pixel 8', platform: 'android', ipAddress: '197.243.1.21', lastActiveAt: iso(-1, 20), createdAt: iso(-40) },
  ];
  return {};
}

/** Turns the sample data on for this tab and signs the fake user in. */
export function enableMock() {
  storage.set('client_access_token', 'mock-access');
  storage.set('client_refresh_token', 'mock-refresh');
  try { sessionStorage.setItem('mock', '1'); } catch { /* ignore */ }
  api.defaults.adapter = async config => {
    await new Promise(r => setTimeout(r, 40));
    const path = (config.url ?? '').split('?')[0];
    const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : (config.data ?? {});
    const params = (config.params ?? {}) as Record<string, any>;
    // The family header, exactly as the real server would see it (the request interceptor has already added it).
    const header = config.headers && typeof (config.headers as any).get === 'function' ? (config.headers as any).get('X-Family-Id') : (config.headers as any)?.['X-Family-Id'];
    const familyAnswer = respondFamily(config.method ?? 'get', path, params, body, typeof header === 'string' ? header : undefined);
    const data = familyAnswer !== undefined
      ? familyAnswer
      : path.startsWith('/push-notifications')
        ? await respondPush(config.method ?? 'get', path, body)
        : respond(config.method ?? 'get', config.url ?? '', params, body);
    if (data && typeof data === 'object' && '__error' in (data as object)) {
      const e = (data as MockError).__error;
      throw Object.assign(new Error(`Request failed with status code ${e.status}`), { isAxiosError: true, config, response: { status: e.status, statusText: String(e.status), data: e.data, headers: {}, config } });
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
}

export const mockRequested = () => {
  try { return new URLSearchParams(location.search).has('mock') || sessionStorage.getItem('mock') === '1'; } catch { return false; }
};
