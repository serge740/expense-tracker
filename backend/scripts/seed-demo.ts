/**
 * Seeds a complete DEMO dataset: people, wallets, ~90 transactions over four months, loans and debts in every state
 * (open, overdue, settled, forgiven, written off, archived, in two currencies), pay dates with reminders, scheduled and
 * recurring transactions, budgets, a family with roles / invites / activity, notifications, devices and more.
 *
 * Everything is dated relative to "now", so it always looks fresh. Running it again replaces the previous demo data
 * (people whose email ends in @demo.abyexpense.test, and the family they created); nothing else is touched.
 *
 *   npm run seed:demo                         (local / scratch databases only)
 *   npm run seed:demo -- --force              (any other database, e.g. a hosted dev one: be sure first)
 *
 * Sign in with  aline@demo.abyexpense.test  /  Demo@1234  (the main account). Eric, Grace, Kevin and Olivier use the same password.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { buildLadder, startPlan } from '../src/modules/reminders/reminder-policy';
import { hashToken, newInviteCode, newInviteToken } from '../src/modules/family/family-codes';
import * as bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL ?? '';
const local = /localhost|127\.0\.0\.1|p1test|scratch|_test|demo/i.test(url);
if (!local && !process.argv.includes('--force')) {
  throw new Error('Refusing to seed: DATABASE_URL does not look local or scratch. Re-run with --force if you really mean this database.');
}

const prisma = new PrismaService();
const PASSWORD = 'Demo@1234';
const DOMAIN = 'demo.abyexpense.test';
const TZ = 'Africa/Kigali'; // UTC+2, no daylight saving: local 09:00 is 07:00 UTC

// ── Time helpers ─────────────────────────────────────────────────────────────
const NOW = new Date();
/** `days` from now (negative = ago) at a Kigali wall-clock hour. */
const at = (days: number, hour = 12, min = 0): Date => {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour - 2, min, 0, 0);
  return d;
};
const ago = (days: number, hour = 12, min = 0) => at(-days, hour, min);
/** The first (or given) day of the month `offset` months from this one, 09:00 Kigali. */
const monthDay = (offset: number, day = 1, hour = 9): Date => new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() + offset, day, hour - 2, 0, 0));
const mm = (offset: number) => { const d = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() + offset, 1)); return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() }; };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Bookkeeping: wallet balances follow the transactions ─────────────────────
const balance = new Map<string, number>();
const bump = (walletId: string | null | undefined, delta: number) => { if (walletId) balance.set(walletId, round2((balance.get(walletId) ?? 0) + delta)); };

type TxSpec = {
  clientId: string; familyId?: string | null; walletId?: string | null; type: 'INCOME' | 'EXPENSE' | 'TRANSFER'; category: string; title: string;
  subCategory?: string | null; description?: string | null; amount: number; date: Date; receipt?: boolean;
  toWalletId?: string; toAmount?: number; exchangeRate?: number; debtId?: string; debtRole?: string; fundedByDebtId?: string; scheduledOccurrenceId?: string;
};
let receiptNo = 0;
async function tx(s: TxSpec) {
  const row = await prisma.transaction.create({
    data: {
      clientId: s.clientId, familyId: s.familyId ?? null, walletId: s.walletId ?? null, type: s.type, category: s.category as any, title: s.title,
      subCategory: s.subCategory ?? null, description: s.description ?? null, amount: s.amount, date: s.date,
      receiptUrl: s.receipt ? `https://res.cloudinary.com/demo/image/upload/receipts/demo-receipt-${++receiptNo}.jpg` : null,
      receiptReportUrl: s.receipt ? `https://res.cloudinary.com/demo/raw/upload/receipts/demo-receipt-${receiptNo}.pdf` : null,
      toWalletId: s.toWalletId ?? null, toAmount: s.toAmount ?? null, exchangeRate: s.exchangeRate ?? null,
      debtId: s.debtId ?? null, debtRole: (s.debtRole as any) ?? null, fundedByDebtId: s.fundedByDebtId ?? null, scheduledOccurrenceId: s.scheduledOccurrenceId ?? null,
    },
  });
  if (s.type === 'INCOME') bump(s.walletId, s.amount);
  else if (s.type === 'EXPENSE') bump(s.walletId, -s.amount);
  else { bump(s.walletId, -s.amount); bump(s.toWalletId, s.toAmount ?? s.amount); }
  return row;
}

// ── Reminders: the same ladder the real engine uses ──────────────────────────
type RemindMode = 'active' | 'snoozed' | 'done' | 'dismissed';
async function reminder(clientId: string, link: { debtId?: string; installmentId?: string; occurrenceId?: string; kind: 'DEBT_PAYMENT' | 'SCHEDULED_TX' }, dueAt: Date, mode: RemindMode) {
  const ladder = buildLadder(dueAt, TZ);
  const plan = startPlan(ladder, NOW);
  const fired = ladder.filter(s => s.at.getTime() <= NOW.getTime());
  const base: any = { clientId, kind: link.kind, debtId: link.debtId ?? null, installmentId: link.installmentId ?? null, occurrenceId: link.occurrenceId ?? null, dueAt, timezone: TZ };
  let data: any;
  if (mode === 'done') data = { ...base, status: 'DONE', step: ladder.length, nextFireAt: null, fireCount: fired.length, lastFiredAt: fired.length ? fired[fired.length - 1].at : null };
  else if (mode === 'dismissed') data = { ...base, status: 'DISMISSED', step: ladder.length, nextFireAt: null, fireCount: fired.length, lastFiredAt: fired.length ? fired[fired.length - 1].at : null };
  else if (mode === 'snoozed') data = { ...base, status: 'SNOOZED', step: plan?.step ?? 0, snoozedUntil: at(0, 18), nextFireAt: at(0, 18), fireCount: fired.length, lastFiredAt: fired.length ? fired[fired.length - 1].at : null };
  else data = { ...base, status: 'ACTIVE', step: plan?.step ?? 0, nextFireAt: plan?.at ?? null, fireCount: fired.length, lastFiredAt: fired.length ? fired[fired.length - 1].at : null };
  const r = await prisma.reminder.create({ data });
  // A log row for every step that already fired, with what the person did about the last one.
  for (const [i, st] of fired.entries()) {
    const last = i === fired.length - 1;
    await prisma.reminderFire.create({
      data: {
        reminderId: r.id, step: st.index, firedAt: st.at, channels: { push: true, email: st.email, inApp: true, digest: false },
        action: last && mode === 'done' ? 'DONE' : last && mode === 'snoozed' ? 'SNOOZED' : last && mode === 'dismissed' ? 'DISMISSED' : i === 0 ? 'OPENED' : 'NONE',
        actedAt: last && mode !== 'active' ? st.at : null,
      },
    });
  }
  return r;
}

// ── Wallets ──────────────────────────────────────────────────────────────────
type W = Record<string, string>;
async function wallet(clientId: string, d: { key?: string; name: string; bank: string; walletType: string; open: number; currency?: string; color: string; last4?: string; holder?: string; number?: string; isDefault?: boolean; archived?: boolean; familyId?: string }) {
  const w = await prisma.wallet.create({
    data: {
      clientId, familyId: d.familyId ?? null, name: d.name, bank: d.bank, walletType: d.walletType as any, currency: d.currency ?? 'RWF', color: d.color,
      last4: d.last4 ?? null, accountHolder: d.holder ?? null, accountNumber: d.number ?? null, isDefault: !!d.isDefault, archived: !!d.archived, balance: 0,
    },
  });
  bump(w.id, d.open);
  return w.id;
}

async function main() {
  console.log('Removing the previous demo data…');
  const old = await prisma.client.findMany({ where: { email: { endsWith: `@${DOMAIN}` } }, select: { id: true } });
  const oldIds = old.map(o => o.id);
  if (oldIds.length) {
    await prisma.family.deleteMany({ where: { createdBy: { in: oldIds } } });
    await prisma.client.deleteMany({ where: { id: { in: oldIds } } });
  }

  // ── People ─────────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash(PASSWORD, 10);
  const person = (first: string, last: string, n: number, extra: Record<string, unknown> = {}) =>
    prisma.client.create({
      data: {
        firstName: first, lastName: last, email: `${first.toLowerCase()}@${DOMAIN}`, phone: `+2507880000${String(n).padStart(2, '0')}`, passwordHash: hash,
        isVerified: true, emailVerifiedAt: ago(120), phoneVerifiedAt: ago(120), profileImage: null, ...extra,
      },
    });
  const aline = await person('Aline', 'Uwase', 1, { isBiometric: true });
  const eric = await person('Eric', 'Mugisha', 2);
  const grace = await person('Grace', 'Uwase', 3);
  const kevin = await person('Kevin', 'Uwase', 4);
  const olivier = await person('Olivier', 'Habimana', 5, { googleId: 'demo-google-olivier' });
  const A = aline.id, E = eric.id, G = grace.id, K = kevin.id, O = olivier.id;

  // Preferences, devices and the like
  const prefs: [string, string, boolean, string][] = [[A, 'en', true, 'Africa/Kigali'], [E, 'en', false, 'Africa/Kigali'], [G, 'fr', false, 'Africa/Kigali'], [K, 'rw', false, 'Africa/Kigali'], [O, 'sw', false, 'Africa/Nairobi']];
  for (const [id, language, quiet, timezone] of prefs) {
    await prisma.notificationPreference.create({ data: { clientId: id, language, quietEnabled: quiet, timezone, quietStart: '22:00', quietEnd: '07:00', dailyPushCap: 8 } });
  }
  await prisma.device.createMany({
    data: [
      { clientId: A, deviceName: 'Pixel 8', platform: 'android', pushToken: 'ExponentPushToken[demo-aline-android]', channelId: 'reminders', ipAddress: '41.186.10.4', lastActiveAt: ago(0, 8) },
      { clientId: A, deviceName: 'iPhone 14', platform: 'ios', pushToken: 'ExponentPushToken[demo-aline-ios]', ipAddress: '41.186.10.9', lastActiveAt: ago(6) },
      { clientId: E, deviceName: 'Galaxy A54', platform: 'android', pushToken: 'ExponentPushToken[demo-eric-android]', lastActiveAt: ago(1) },
    ],
  });
  await prisma.webPushSubscription.create({
    data: { clientId: A, endpoint: 'https://fcm.googleapis.com/fcm/send/demo-aline-chrome', p256dh: 'demo-p256dh-key', auth: 'demo-auth-secret', label: 'Chrome on Windows', browser: 'Chrome', os: 'Windows', deviceType: 'desktop', lastSeenAt: ago(0, 7), lastSuccessAt: ago(2) },
  });
  await prisma.passkey.create({
    data: { id: 'demo-passkey-aline-1', publicKey: Buffer.from('demo-public-key'), counter: 3, transports: ['internal', 'hybrid'], deviceType: 'multiDevice', backedUp: true, deviceName: 'Windows Hello', clientId: A },
  });
  const subs: [string, string, string, number][] = [
    ['EXPENSE', 'food', 'Brochettes', 6], ['EXPENSE', 'food', 'Groceries', 14], ['EXPENSE', 'transport', 'Moto-taxi', 12], ['EXPENSE', 'bills', 'Prepaid electricity', 5],
    ['EXPENSE', 'entertainment', 'Football match', 2], ['EXPENSE', 'gifts', 'Tithe', 3], ['INCOME', 'freelance', 'Web project', 2], ['INCOME', 'freelance', 'Logo', 1],
    ['INCOME', 'salary', 'Monthly salary', 4], ['INCOME', 'gifts', 'From parents', 2], ['EXPENSE', 'health', 'My yoga class', 1],
  ];
  for (const [i, [kind, category, name, usageCount]] of subs.entries()) {
    await prisma.userSubCategory.create({ data: { clientId: A, kind: kind as any, category: category as any, name, usageCount, lastUsedAt: ago(i * 3 + 1) } });
  }

  // ── Aline's wallets ────────────────────────────────────────────────────────
  const w: W = {};
  w.bank = await wallet(A, { name: 'Equity Current', bank: 'Equity Bank', walletType: 'CHECKING', open: 1_200_000, color: '#0F2F3A', last4: '4821', holder: 'Aline Uwase', number: '4003012345821', isDefault: true });
  w.savings = await wallet(A, { name: 'BK Savings', bank: 'Bank of Kigali', walletType: 'SAVINGS', open: 2_400_000, color: '#15803D', last4: '7710', holder: 'Aline Uwase' });
  w.cash = await wallet(A, { name: 'Cash', bank: 'Cash', walletType: 'CASH', open: 60_000, color: '#B45309' });
  w.momo = await wallet(A, { name: 'MTN MoMo', bank: 'MTN Mobile Money', walletType: 'MOBILE_MONEY', open: 180_000, color: '#F59E0B', number: '0788000001' });
  w.credit = await wallet(A, { name: 'Visa Credit', bank: 'I&M Bank', walletType: 'CREDIT', open: -150_000, color: '#6D28D9', last4: '9034', holder: 'Aline Uwase' });
  w.usd = await wallet(A, { name: 'Dollar account', bank: 'Equity Bank', walletType: 'CHECKING', open: 420, currency: 'USD', color: '#0284C7', last4: '1156' });
  w.old = await wallet(A, { name: 'Old Zigama account', bank: 'Zigama CSS', walletType: 'CHECKING', open: 0, color: '#64748B', archived: true });

  // ── Aline's everyday transactions ──────────────────────────────────────────
  type Row = [number, string, string | null, string, number, keyof typeof w, boolean?];
  const incomes: [number, string, string | null, string, number, keyof typeof w][] = [
    [3, 'salary', 'Monthly salary', 'October salary', 850_000, 'bank'], [33, 'salary', 'Monthly salary', 'September salary', 850_000, 'bank'],
    [63, 'salary', 'Monthly salary', 'August salary', 850_000, 'bank'], [93, 'salary', 'Monthly salary', 'July salary', 820_000, 'bank'],
    [12, 'freelance', 'Web project', 'Landing page for Kigali Bakes', 180_000, 'bank'], [45, 'freelance', 'Logo', 'Logo for Mutara Farm', 60_000, 'momo'],
    [70, 'freelance', 'Web project', 'Upwork milestone', 250, 'usd'], [20, 'investment', 'Dividends', 'Dividends: BK Group', 35_000, 'savings'],
    [50, 'investment', 'Savings interest', 'Savings interest', 12_000, 'savings'], [26, 'gifts', 'Birthday money', 'Birthday money from Auntie', 50_000, 'cash'],
    [58, 'gifts', 'From parents', 'Pocket money from parents', 80_000, 'momo'], [9, 'refund', 'Online order refund', 'Jumia refund', 24_000, 'momo'],
    [40, 'refund', 'Cashback', 'Card cashback', 6_500, 'bank'], [66, 'refund', 'Insurance claim', 'Mutuelle claim paid', 38_000, 'bank'],
    [35, 'savings', 'Savings withdrawal', 'Withdrew from savings', 100_000, 'bank'],
  ];
  for (const [d, category, sub, title, amount, wk] of incomes) {
    await tx({ clientId: A, walletId: w[wk], type: 'INCOME', category, subCategory: sub, title, amount, date: ago(d, 9 + (d % 6)), receipt: d === 12 });
  }
  const expenses: Row[] = [
    [1, 'food', 'Groceries', 'Simba Supermarket', 42_300, 'bank', true], [2, 'food', 'Restaurants', 'Lunch at Repub Lounge', 18_500, 'momo'], [4, 'food', 'Street food', 'Brochettes', 6_000, 'cash'],
    [6, 'food', 'Coffee', 'Bourbon Coffee', 4_500, 'momo'], [8, 'food', 'Food delivery', 'Glovo order', 12_800, 'credit'], [11, 'food', 'Open market', 'Open market vegetables', 9_500, 'cash'],
    [15, 'food', 'Bakery', 'Birthday cake', 22_000, 'bank'], [19, 'food', 'Groceries', 'Weekly shopping', 55_400, 'bank', true], [31, 'food', 'Fruits', 'Fruits and eggs', 8_700, 'cash'],
    [44, 'food', 'Groceries', 'Simba Supermarket', 61_200, 'bank'], [1, 'transport', 'Moto-taxi', 'Moto to town', 2_500, 'cash'], [3, 'transport', 'Ride app', 'Yego ride', 5_800, 'momo'],
    [7, 'transport', 'Fuel', 'Fuel at Total Kimironko', 30_000, 'bank'], [13, 'transport', 'Bus fare', 'Bus to Musanze', 3_500, 'cash'], [21, 'transport', 'Car repair', 'Tyre change', 45_000, 'bank', true],
    [37, 'transport', 'Flights', 'Flight to Nairobi', 280_000, 'credit', true], [52, 'transport', 'Parking', 'Airport parking', 4_000, 'cash'], [2, 'bills', 'Airtime', 'MTN airtime', 5_000, 'momo'],
    [5, 'bills', 'Prepaid electricity', 'REG cash power', 15_000, 'momo'], [9, 'bills', 'Internet', 'Home internet', 29_000, 'bank'], [14, 'bills', 'Water', 'WASAC water', 8_200, 'momo'],
    [33, 'bills', 'Prepaid electricity', 'REG cash power', 15_000, 'momo'], [16, 'entertainment', 'Spotify', 'Spotify', 3_500, 'credit'], [23, 'entertainment', 'Cinema', 'Century Cinema', 9_000, 'momo'],
    [35, 'entertainment', 'Football match', 'Stadium ticket', 10_000, 'cash'], [17, 'shopping', 'Clothing', 'Shirt at Zara', 38_000, 'credit'], [28, 'shopping', 'Phone case', 'Phone case', 12_000, 'bank'],
    [46, 'shopping', 'Bags', 'Laptop bag', 55_000, 'bank'], [18, 'health', 'Pharmacy', 'Pharmacy', 14_200, 'momo'], [27, 'health', 'Gym membership', 'Gym membership', 30_000, 'bank'],
    [39, 'health', 'Haircut', 'Barber', 5_000, 'cash'], [55, 'health', 'Doctor visit', 'Clinic check-up', 25_000, 'bank', true], [22, 'gifts', 'Wedding gift', 'Wedding gift for Claire', 50_000, 'bank'],
    [48, 'gifts', 'Tithe', 'Church offering', 20_000, 'cash'], [60, 'gifts', 'Family support', 'Support to parents', 100_000, 'bank'], [30, 'insurance', 'Health insurance', 'Mutuelle', 45_000, 'bank'],
    [47, 'insurance', 'MoMo fees', 'MoMo fees', 1_500, 'momo'], [20, 'other', null, 'Miscellaneous', 7_000, 'cash'], [30, 'shopping', 'Online orders', 'Amazon order', 45, 'usd'],
    [64, 'business', 'Software', 'Domain and hosting', 28_000, 'bank'],
  ];
  for (const [d, category, sub, title, amount, wk, receipt] of expenses) {
    await tx({ clientId: A, walletId: w[wk], type: 'EXPENSE', category, subCategory: sub, title, amount, date: ago(d, 8 + (d % 10)), receipt });
  }
  // Two entries that look like one purchase entered twice (History flags them as a possible duplicate)
  for (const h of [14, 15]) await tx({ clientId: A, walletId: w.momo, type: 'EXPENSE', category: 'food', subCategory: 'Restaurants', title: 'Lunch at Kigali Heights', amount: 23_500, date: ago(2, h) });
  // Moving money between my own wallets (and one currency exchange)
  const transfers: [number, string, string, number, string, number?, number?][] = [
    [5, 'bank', 'savings', 100_000, 'Monthly saving'], [21, 'bank', 'momo', 50_000, 'Top up MoMo'], [34, 'bank', 'cash', 30_000, 'Cash withdrawal'],
    [62, 'savings', 'bank', 80_000, 'Move from savings'], [50, 'bank', 'usd', 130_000, 'Exchange to dollars', 100, 0.00076923],
  ];
  for (const [d, from, to, amount, title, toAmount, rate] of transfers) {
    await tx({ clientId: A, walletId: w[from], type: 'TRANSFER', category: 'other', title, amount, date: ago(d, 10), toWalletId: w[to], toAmount, exchangeRate: rate });
  }

  // ── Debts and credits ──────────────────────────────────────────────────────
  type Pay = [number, number, string?];            // days ago, amount, note
  type Inst = { dueIn: number; planned?: number; status?: 'PENDING' | 'MOVED' | 'SKIPPED'; fromPlan?: boolean; movedFrom?: number; note?: string; remind?: RemindMode };
  type DebtSpec = {
    kind: 'BORROWED' | 'LENT'; person: string; phone?: string; amount: number; currency?: string; startAgo: number; dueIn?: number | null; note?: string;
    wallet?: keyof typeof w; payWallet?: keyof typeof w; payments?: Pay[]; installments?: Inst[]; status: 'OPEN' | 'SETTLED' | 'WRITTEN_OFF' | 'FORGIVEN';
    writtenOff?: number; archived?: boolean; plan?: { amount: number; startIn: number }; remindersOn?: boolean; spent?: number;
  };
  const debtIds: Record<string, string> = {};
  async function debt(key: string, s: DebtSpec) {
    const currency = s.currency ?? 'RWF';
    const paidTotal = round2(sum((s.payments ?? []).map(p => p[1])));
    const d = await prisma.debt.create({
      data: {
        clientId: A, kind: s.kind, person: s.person, phone: s.phone ?? null, amount: s.amount, paid: paidTotal, writtenOffAmount: s.writtenOff ?? 0, spent: s.spent ?? 0,
        currency, date: ago(s.startAgo, 10), dueDate: s.dueIn == null ? null : at(s.dueIn, 17), note: s.note ?? null, walletId: s.wallet ? w[s.wallet] : null, status: s.status,
        archivedAt: s.archived ? ago(5) : null, remindersOn: !!s.remindersOn,
        planAmount: s.plan?.amount ?? null, planStartAt: s.plan ? at(s.plan.startIn, 9) : null, planTimezone: s.plan ? TZ : null,
        planRepeat: s.plan ? { unit: 'MONTH', every: 1, weekdays: [], monthDays: [at(s.plan.startIn).getUTCDate()], nth: null, months: [], ends: { type: 'never' } } : undefined,
      },
    });
    debtIds[key] = d.id;
    // The money that moved when it began (a debt with no wallet is only a record)
    if (s.wallet) {
      const principal = await tx({
        clientId: A, walletId: w[s.wallet], type: s.kind === 'BORROWED' ? 'INCOME' : 'EXPENSE', category: 'loan', title: s.kind === 'BORROWED' ? `Borrowed from ${s.person}` : `Lent to ${s.person}`,
        amount: s.amount, date: ago(s.startAgo, 10), debtId: d.id, debtRole: s.kind === 'BORROWED' ? 'BORROW_IN' : 'LEND_OUT',
      });
      await prisma.debt.update({ where: { id: d.id }, data: { principalTransactionId: principal.id } });
    }
    // Payments (paying a debt never touches my wallets; being repaid goes into the chosen wallet)
    for (const [i, [daysAgo, amount, note]] of (s.payments ?? []).entries()) {
      const walletId = s.kind === 'LENT' && s.payWallet ? w[s.payWallet] : null;
      const t = await tx({
        clientId: A, walletId, type: s.kind === 'BORROWED' ? 'EXPENSE' : 'INCOME', category: 'loan', title: s.kind === 'BORROWED' ? `Repaid ${s.person}` : `Repayment from ${s.person}`,
        description: note ?? null, amount, date: ago(daysAgo, 15), debtId: d.id, debtRole: s.kind === 'BORROWED' ? 'REPAY_OUT' : 'REPAY_IN', receipt: i === 0,
      });
      await prisma.debtPayment.create({
        data: {
          debtId: d.id, amount, date: ago(daysAgo, 15), walletId, transactionId: t.id, note: note ?? null,
          receiptUrl: i === 0 ? `https://res.cloudinary.com/demo/image/upload/receipts/payment-proof-${key}.jpg` : null,
          receiptReportUrl: i === 0 ? `https://res.cloudinary.com/demo/raw/upload/receipts/payment-proof-${key}.pdf` : null,
        },
      });
    }
    // Pay dates, and a reminder on the ones that are still ahead (or just missed)
    const created: string[] = [];
    for (const [i, inst] of (s.installments ?? []).entries()) {
      const dueAt = at(inst.dueIn, 9);
      const row = await prisma.debtInstallment.create({
        data: {
          debtId: d.id, dueAt, plannedAmount: inst.planned ?? null, status: inst.status ?? 'PENDING', movedFromId: inst.movedFrom != null ? created[inst.movedFrom] : null,
          note: inst.note ?? null, fromPlan: !!inst.fromPlan,
        },
      });
      created.push(row.id);
      if (inst.remind && (inst.status ?? 'PENDING') === 'PENDING') await reminder(A, { kind: 'DEBT_PAYMENT', debtId: d.id, installmentId: row.id }, dueAt, inst.remind);
      void i;
    }
    return d.id;
  }

  // Money I owe
  const planOf = (n: number, first: number): Inst[] => Array.from({ length: n }, (_, i) => ({ dueIn: first + i * 30, planned: 50_000, fromPlan: true }));
  await debt('bosco', {
    kind: 'BORROWED', person: 'Jean Bosco', phone: '+250788111222', amount: 500_000, startAgo: 75, dueIn: 200, wallet: 'bank', status: 'OPEN', note: 'For the laptop and two months of rent',
    payments: [[45, 50_000, 'First instalment'], [15, 50_000], [2, 50_000, 'Paid by MoMo']], spent: 120_000, remindersOn: true,
    installments: [{ dueIn: -45, planned: 50_000, fromPlan: true }, { dueIn: -15, planned: 50_000, fromPlan: true }, { dueIn: -2, planned: 50_000, fromPlan: true },
      { dueIn: 3, planned: 50_000, fromPlan: true, remind: 'active' }, ...planOf(6, 33).map((x, i) => (i === 0 ? { ...x, remind: 'snoozed' as RemindMode } : x))],
    plan: { amount: 50_000, startIn: 3 },
  });
  await debt('sacco', {
    kind: 'BORROWED', person: 'Umurenge SACCO', amount: 1_200_000, startAgo: 150, dueIn: -6, wallet: 'bank', status: 'OPEN', note: 'Business loan, 12 months', remindersOn: true,
    payments: [[120, 100_000], [90, 100_000], [60, 100_000, 'Part paid'], [30, 100_000]],
    installments: [{ dueIn: -120, planned: 100_000 }, { dueIn: -90, planned: 100_000 }, { dueIn: -60, planned: 100_000 }, { dueIn: -30, planned: 100_000 },
      { dueIn: -12, planned: 100_000, status: 'MOVED', note: 'Asked for more time' }, { dueIn: -6, planned: 100_000, movedFrom: 4, note: 'Moved by a week', remind: 'active' }, { dueIn: 24, planned: 100_000, remind: 'active' }],
  });
  await debt('patrick', {
    kind: 'BORROWED', person: 'Uncle Patrick', phone: '+250788333444', amount: 200_000, startAgo: 110, dueIn: -20, wallet: 'cash', status: 'SETTLED',
    payments: [[70, 120_000], [22, 80_000, 'Last payment, thank you']], installments: [{ dueIn: -70, planned: 120_000 }, { dueIn: -22, planned: 80_000, remind: 'done' }], remindersOn: true,
  });
  await debt('claudine', {
    kind: 'BORROWED', person: 'Mutesi Claudine', amount: 80_000, startAgo: 130, dueIn: -60, status: 'FORGIVEN', writtenOff: 50_000, note: 'She forgave the rest at the wedding',
    payments: [[100, 30_000]], installments: [{ dueIn: -100, planned: 30_000 }, { dueIn: -60, planned: 50_000, status: 'SKIPPED', note: 'Forgiven' }],
  });
  await debt('fiverr', {
    kind: 'BORROWED', person: 'Fiverr Capital', amount: 300, currency: 'USD', startAgo: 50, dueIn: 40, wallet: 'usd', status: 'OPEN', note: 'Advance on a gig', remindersOn: true,
    payments: [[20, 100]], installments: [{ dueIn: -20, planned: 100 }, { dueIn: 10, planned: 100, remind: 'active' }, { dueIn: 40, planned: 100, remind: 'active' }],
  });
  // Money owed to me
  await debt('eric', {
    kind: 'LENT', person: 'Eric Mugisha', phone: '+250788000002', amount: 150_000, startAgo: 40, dueIn: 10, wallet: 'cash', payWallet: 'momo', status: 'OPEN', note: 'School fees top-up', remindersOn: true,
    payments: [[25, 50_000, 'Sent by MoMo'], [8, 50_000]], installments: [{ dueIn: -25, planned: 50_000 }, { dueIn: -8, planned: 50_000 }, { dueIn: 10, planned: 50_000, remind: 'active' }],
  });
  await debt('diane', {
    kind: 'LENT', person: 'Diane Ingabire', phone: '+250788555666', amount: 300_000, startAgo: 95, dueIn: -30, wallet: 'bank', status: 'OPEN', note: 'Rent deposit; keeps promising next week',
  });
  await debt('samuel', {
    kind: 'LENT', person: 'Samuel Nkusi', amount: 60_000, startAgo: 80, dueIn: -35, wallet: 'momo', payWallet: 'momo', status: 'SETTLED', payments: [[60, 20_000], [45, 20_000], [30, 20_000, 'All done']],
    installments: [{ dueIn: -60, planned: 20_000 }, { dueIn: -45, planned: 20_000 }, { dueIn: -30, planned: 20_000, remind: 'done' }],
  });
  await debt('chantal', {
    kind: 'LENT', person: 'Chantal Mukamana', amount: 100_000, startAgo: 140, dueIn: -90, status: 'WRITTEN_OFF', writtenOff: 60_000, note: 'Recorded only: no wallet was used',
    payments: [[110, 40_000]], installments: [{ dueIn: -110, planned: 40_000 }, { dueIn: -90, planned: 60_000, status: 'SKIPPED', note: 'Gave up the rest' }],
  });
  await debt('paul', {
    kind: 'LENT', person: 'Old friend Paul', amount: 50_000, startAgo: 200, dueIn: -150, wallet: 'cash', status: 'OPEN', archived: true, note: 'Archived: long forgotten',
  });
  // Ordinary expenses paid out of Jean Bosco's borrowed money (his "pot")
  await tx({ clientId: A, walletId: w.bank, type: 'EXPENSE', category: 'shopping', subCategory: 'Laptop', title: 'Laptop deposit', amount: 80_000, date: ago(70, 11), fundedByDebtId: debtIds.bosco, receipt: true });
  await tx({ clientId: A, walletId: w.bank, type: 'EXPENSE', category: 'bills', subCategory: 'Rent', title: 'Part of the rent', amount: 40_000, date: ago(68, 11), fundedByDebtId: debtIds.bosco });

  // ── Scheduled and recurring ────────────────────────────────────────────────
  const monthly = (day: number, ends: any = { type: 'never' }) => ({ unit: 'MONTH', every: 1, weekdays: [], monthDays: [day], nth: null, months: [], ends });
  const weekly = (day: number) => ({ unit: 'WEEK', every: 1, weekdays: [day], monthDays: [], nth: null, months: [], ends: { type: 'never' } });
  async function schedule(d: {
    type: 'INCOME' | 'EXPENSE'; category: string; sub?: string; title: string; amount: number; wallet: keyof typeof w; startAt: Date; repeat: any | null; mode: 'REMIND_CONFIRM' | 'AUTO_POST';
    status?: 'ACTIVE' | 'PAUSED' | 'ENDED'; description?: string;
  }) {
    return prisma.scheduledTransaction.create({
      data: {
        clientId: A, type: d.type, category: d.category as any, subCategory: d.sub ?? null, title: d.title, description: d.description ?? null, amount: d.amount, walletId: w[d.wallet],
        startAt: d.startAt, timezone: TZ, repeat: d.repeat ?? undefined, mode: d.mode, status: d.status ?? 'ACTIVE',
      },
    });
  }
  async function occurrence(s: { id: string }, dueAt: Date, status: 'PENDING' | 'POSTED' | 'SKIPPED' | 'FAILED', extra: { tx?: Omit<TxSpec, 'clientId' | 'date' | 'scheduledOccurrenceId'>; fail?: string; remind?: RemindMode } = {}) {
    const o = await prisma.scheduledOccurrence.create({ data: { scheduleId: s.id, dueAt, status, failReason: extra.fail ?? null, handledAt: status === 'PENDING' ? null : dueAt } });
    if (status === 'POSTED' && extra.tx) {
      const t = await tx({ ...extra.tx, clientId: A, date: dueAt, scheduledOccurrenceId: o.id });
      await prisma.scheduledOccurrence.update({ where: { id: o.id }, data: { transactionId: t.id } });
    }
    if (extra.remind) await reminder(A, { kind: 'SCHEDULED_TX', occurrenceId: o.id }, dueAt, extra.remind);
    return o;
  }
  const upd = (id: string, lastDueAt: Date | null, nextDueAt: Date | null) => prisma.scheduledTransaction.update({ where: { id }, data: { lastDueAt, nextDueAt } });

  // Rent: remind and confirm, on the 1st
  const rent = await schedule({ type: 'EXPENSE', category: 'bills', sub: 'Rent', title: 'House rent', amount: 350_000, wallet: 'bank', startAt: monthDay(-3), repeat: monthly(1), mode: 'REMIND_CONFIRM' });
  const rentTx = { walletId: w.bank, type: 'EXPENSE' as const, category: 'bills', subCategory: 'Rent', title: 'House rent', amount: 350_000, receipt: true };
  await occurrence(rent, monthDay(-2), 'POSTED', { tx: rentTx });
  await occurrence(rent, monthDay(-1), 'POSTED', { tx: rentTx });
  await occurrence(rent, monthDay(0), 'SKIPPED');
  await occurrence(rent, monthDay(1), 'PENDING', { remind: 'active' });
  await upd(rent.id, monthDay(0), monthDay(1));
  // Gym: weekly on Mondays, posts by itself
  const gym = await schedule({ type: 'EXPENSE', category: 'health', sub: 'Fitness class', title: 'Monday gym class', amount: 7_500, wallet: 'cash', startAt: ago(40), repeat: weekly(1), mode: 'AUTO_POST' });
  const mondays: Date[] = [];
  for (let d = 1; mondays.length < 4 && d < 40; d++) { const t = ago(d, 18); if (t.getUTCDay() === 1) mondays.push(t); }
  for (const m of mondays.reverse()) await occurrence(gym, m, 'POSTED', { tx: { walletId: w.cash, type: 'EXPENSE', category: 'health', subCategory: 'Fitness class', title: 'Monday gym class', amount: 7_500 } });
  const nextMonday = (() => { for (let d = 1; d < 8; d++) { const t = at(d, 18); if (t.getUTCDay() === 1) return t; } return at(7, 18); })();
  await occurrence(gym, nextMonday, 'PENDING');
  await upd(gym.id, mondays[mondays.length - 1] ?? null, nextMonday);
  // Netflix: monthly on the 12th, posts by itself, paid by card
  const netflix = await schedule({ type: 'EXPENSE', category: 'entertainment', sub: 'Netflix', title: 'Netflix', amount: 7_500, wallet: 'credit', startAt: monthDay(-3, 12), repeat: monthly(12), mode: 'AUTO_POST' });
  const nfTx = { walletId: w.credit, type: 'EXPENSE' as const, category: 'entertainment', subCategory: 'Netflix', title: 'Netflix', amount: 7_500 };
  const nfPast = [monthDay(-2, 12), monthDay(-1, 12), monthDay(0, 12)].filter(d => d < NOW);
  for (const d of nfPast) await occurrence(netflix, d, 'POSTED', { tx: nfTx });
  const nfNext = monthDay(nfPast.length === 3 ? 1 : 0, 12);
  await occurrence(netflix, nfNext, 'PENDING');
  await upd(netflix.id, nfPast[nfPast.length - 1] ?? null, nfNext);
  // Salary: expect it on the 28th and confirm when it lands
  const salary = await schedule({ type: 'INCOME', category: 'salary', sub: 'Monthly salary', title: 'Salary', amount: 850_000, wallet: 'bank', startAt: monthDay(-1, 28), repeat: monthly(28), mode: 'REMIND_CONFIRM' });
  const salNext = monthDay(monthDay(0, 28) > NOW ? 0 : 1, 28);
  await occurrence(salary, salNext, 'PENDING', { remind: 'active' });
  await upd(salary.id, null, salNext);
  // One time, in the future
  const once = await schedule({ type: 'EXPENSE', category: 'insurance', sub: 'Vehicle insurance', title: 'Car insurance renewal', amount: 180_000, wallet: 'bank', startAt: at(25, 9), repeat: null, mode: 'REMIND_CONFIRM', description: 'Renew before the sticker expires' });
  await occurrence(once, at(25, 9), 'PENDING', { remind: 'active' });
  await upd(once.id, null, at(25, 9));
  // Paused, with a failed attempt (it used a wallet that was archived)
  const lang = await schedule({ type: 'EXPENSE', category: 'health', sub: 'Courses', title: 'Language class', amount: 25_000, wallet: 'old', startAt: ago(60), repeat: weekly(6), mode: 'AUTO_POST', status: 'PAUSED' });
  await occurrence(lang, ago(14, 10), 'FAILED', { fail: 'The wallet is archived' });
  await upd(lang.id, ago(14, 10), null);
  // Ended after three payments
  const phone = await schedule({ type: 'EXPENSE', category: 'shopping', sub: 'Phone', title: 'Phone instalment', amount: 40_000, wallet: 'bank', startAt: monthDay(-3, 8), repeat: monthly(8, { type: 'after', count: 3 }), mode: 'AUTO_POST', status: 'ENDED' });
  for (const d of [monthDay(-3, 8), monthDay(-2, 8), monthDay(-1, 8)]) {
    await occurrence(phone, d, 'POSTED', { tx: { walletId: w.bank, type: 'EXPENSE', category: 'shopping', subCategory: 'Phone', title: 'Phone instalment', amount: 40_000 } });
  }
  await upd(phone.id, monthDay(-1, 8), null);

  // ── Budgets ────────────────────────────────────────────────────────────────
  for (const [offset, limit] of [[0, 600_000], [-1, 550_000], [-2, 500_000]] as const) {
    await prisma.budget.create({ data: { clientId: A, scopeKey: `p:${A}`, ...mm(offset), limit } });
  }

  // ── Notifications (a week of them, some read) ──────────────────────────────
  const notes: [number, string, string, 'transaction' | 'security' | 'system' | 'reminder', 'push' | 'email' | 'in_app', boolean, any?][] = [
    [0, 'Payment due soon', 'Pay Jean Bosco 50,000 FRw in 3 days.', 'reminder', 'push', false, { debtId: debtIds.bosco }],
    [0, 'Pay Umurenge SACCO', 'This pay date was 6 days ago. Record the payment or move the date.', 'reminder', 'in_app', false, { debtId: debtIds.sacco }],
    [1, 'Budget at 82%', 'You have used 82% of your October budget.', 'transaction', 'push', false],
    [1, 'Rent skipped', 'You skipped this month’s house rent.', 'transaction', 'in_app', true],
    [2, 'Repayment received', 'Eric Mugisha repaid you 50,000 FRw.', 'transaction', 'in_app', true, { debtId: debtIds.eric }],
    [3, 'New sign-in', 'Your account was opened on Pixel 8.', 'security', 'email', true],
    [4, 'Transaction added', 'Simba Supermarket: −42,300 FRw.', 'transaction', 'in_app', true],
    [5, 'Passkey added', 'A passkey was added to your account.', 'security', 'email', true],
    [6, 'Uncle Patrick: settled', 'You have fully repaid Uncle Patrick.', 'transaction', 'push', true, { debtId: debtIds.patrick }],
    [8, 'Welcome back', 'Your weekly summary is ready.', 'system', 'in_app', true],
    [10, 'Diane Ingabire is late', 'Diane has not repaid 300,000 FRw yet.', 'reminder', 'push', true, { debtId: debtIds.diane }],
    [14, 'Scheduled payment failed', 'Language class could not be posted: the wallet is archived.', 'transaction', 'in_app', false],
    [21, 'App update', 'New: loans and debts now have reminders.', 'system', 'in_app', true],
    [30, 'Samuel repaid in full', 'Samuel Nkusi has fully repaid you.', 'transaction', 'push', true, { debtId: debtIds.samuel }],
  ];
  for (const [d, title, body, type, channel, read, data] of notes) {
    await prisma.notification.create({ data: { clientId: A, title, body, type: type as any, channel: channel as any, read, data: data ?? undefined, createdAt: ago(d, 9 + (d % 8)) } });
  }

  // ── Eric: a second, smaller account ────────────────────────────────────────
  const ew = { momo: await wallet(E, { name: 'Airtel Money', bank: 'Airtel Money', walletType: 'MOBILE_MONEY', open: 90_000, color: '#DC2626', isDefault: true }),
    cash: await wallet(E, { name: 'Pocket cash', bank: 'Cash', walletType: 'CASH', open: 25_000, color: '#B45309' }) };
  const eTx: [number, 'INCOME' | 'EXPENSE', string, string | null, string, number, keyof typeof ew][] = [
    [4, 'INCOME', 'salary', 'Monthly salary', 'Salary', 420_000, 'momo'], [34, 'INCOME', 'salary', 'Monthly salary', 'Salary', 420_000, 'momo'], [18, 'INCOME', 'freelance', 'Design', 'Poster design', 45_000, 'momo'],
    [2, 'EXPENSE', 'food', 'Restaurants', 'Lunch', 7_500, 'cash'], [5, 'EXPENSE', 'transport', 'Moto-taxi', 'Moto', 3_000, 'cash'], [7, 'EXPENSE', 'bills', 'Airtime', 'Airtime', 5_000, 'momo'],
    [9, 'EXPENSE', 'shopping', 'Clothing', 'Jeans', 28_000, 'momo'], [12, 'EXPENSE', 'health', 'Pharmacy', 'Pharmacy', 9_000, 'momo'], [16, 'EXPENSE', 'entertainment', 'Cinema', 'Cinema', 6_000, 'cash'],
    [20, 'EXPENSE', 'food', 'Groceries', 'Groceries', 34_000, 'momo'], [26, 'EXPENSE', 'bills', 'Rent', 'Room rent', 120_000, 'momo'], [30, 'EXPENSE', 'gifts', 'Birthday gift', 'Gift for Mum', 25_000, 'momo'],
    [36, 'EXPENSE', 'transport', 'Bus fare', 'Bus to Huye', 4_500, 'cash'], [41, 'EXPENSE', 'food', 'Coffee', 'Coffee', 2_500, 'cash'], [55, 'EXPENSE', 'bills', 'Rent', 'Room rent', 120_000, 'momo'],
  ];
  for (const [d, type, category, sub, title, amount, wk] of eTx) await tx({ clientId: E, walletId: ew[wk], type, category, subCategory: sub, title, amount, date: ago(d, 11) });
  await prisma.budget.create({ data: { clientId: E, scopeKey: `p:${E}`, ...mm(0), limit: 250_000 } });
  // Grace, Kevin, Olivier: a wallet and a few rows each, so every member has something of their own
  for (const [id, name, bank] of [[G, 'Grace’s cash', 'Cash'], [K, 'Kevin’s pocket', 'Cash'], [O, 'Olivier’s M-Pesa', 'M-Pesa']] as const) {
    const wid = await wallet(id, { name, bank, walletType: bank === 'M-Pesa' ? 'MOBILE_MONEY' : 'CASH', open: 30_000, color: '#0F766E', isDefault: true });
    await tx({ clientId: id, walletId: wid, type: 'INCOME', category: 'gifts', subCategory: 'Pocket money', title: 'Pocket money', amount: 20_000, date: ago(10) });
    await tx({ clientId: id, walletId: wid, type: 'EXPENSE', category: 'food', subCategory: 'Snacks', title: 'Snacks', amount: 3_500, date: ago(4) });
    await tx({ clientId: id, walletId: wid, type: 'EXPENSE', category: 'entertainment', subCategory: 'Video games', title: 'Game credit', amount: 5_000, date: ago(7) });
  }

  // ── The family ─────────────────────────────────────────────────────────────
  const family = await prisma.family.create({ data: { name: 'Mwiza Family', currency: 'RWF', timezone: TZ, createdBy: A, createdAt: ago(100) } });
  const F = family.id;
  const members: [string, 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER', string | null, number][] = [[A, 'OWNER', 'Mama', 100], [E, 'ADMIN', null, 95], [G, 'MEMBER', 'Gigi', 90], [K, 'VIEWER', null, 60]];
  for (const [clientId, role, nickname, joined] of members) {
    await prisma.familyMember.create({ data: { familyId: F, clientId, role, nickname, status: 'ACTIVE', joinedAt: ago(joined), activeKey: clientId } });
  }
  await prisma.familyMember.create({ data: { familyId: F, clientId: O, role: 'MEMBER', status: 'LEFT', joinedAt: ago(80), leftAt: ago(35), activeKey: null } });
  const inv = (days: number, status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED', extra: Record<string, unknown> = {}) => {
    const token = newInviteToken();
    return prisma.familyInvite.create({
      data: { familyId: F, invitedBy: A, role: 'MEMBER', tokenHash: hashToken(token), code: newInviteCode(), status, expiresAt: at(days), createdAt: at(days - 7), ...extra },
    });
  };
  const pending = await inv(5, 'PENDING');
  await inv(4, 'PENDING', { role: 'VIEWER', email: 'cousin@example.com' });
  await inv(-10, 'EXPIRED', { phone: '+250788777666' });
  await inv(-20, 'REVOKED');
  await inv(-60, 'ACCEPTED', { acceptedBy: K, acceptedAt: ago(60), role: 'VIEWER' });

  const fw: W = {};
  fw.cash = await wallet(A, { familyId: F, name: 'Household cash', bank: 'Cash', walletType: 'CASH', open: 150_000, color: '#B45309', isDefault: true });
  fw.bank = await wallet(A, { familyId: F, name: 'Family Equity', bank: 'Equity Bank', walletType: 'CHECKING', open: 1_800_000, color: '#5B3FD0', last4: '3302' });
  fw.school = await wallet(E, { familyId: F, name: 'School fund', bank: 'Bank of Kigali', walletType: 'SAVINGS', open: 600_000, color: '#15803D' });
  fw.momo = await wallet(A, { familyId: F, name: 'Family MoMo', bank: 'MTN Mobile Money', walletType: 'MOBILE_MONEY', open: 300_000, color: '#F59E0B' });
  const ft: [number, string, 'INCOME' | 'EXPENSE', string, string | null, string, number, string][] = [
    [3, A, 'INCOME', 'salary', 'Monthly salary', 'Family contribution: Aline', 300_000, 'bank'], [3, E, 'INCOME', 'salary', 'Monthly salary', 'Family contribution: Eric', 200_000, 'bank'],
    [33, A, 'INCOME', 'salary', 'Monthly salary', 'Family contribution: Aline', 300_000, 'bank'], [33, E, 'INCOME', 'salary', 'Monthly salary', 'Family contribution: Eric', 200_000, 'bank'],
    [63, A, 'INCOME', 'salary', 'Monthly salary', 'Family contribution: Aline', 300_000, 'bank'], [14, G, 'INCOME', 'gifts', 'Birthday money', 'Birthday money for Grace', 40_000, 'cash'],
    [1, A, 'EXPENSE', 'food', 'Groceries', 'Family groceries', 78_000, 'bank'], [2, G, 'EXPENSE', 'food', 'Bread', 'Bread and milk', 3_800, 'cash'], [5, E, 'EXPENSE', 'food', 'Groceries', 'Weekend shopping', 66_000, 'bank'],
    [8, A, 'EXPENSE', 'food', 'Restaurants', 'Family dinner', 54_000, 'bank'], [10, G, 'EXPENSE', 'food', 'Snacks', 'Snacks', 4_500, 'cash'], [13, A, 'EXPENSE', 'food', 'Groceries', 'Groceries', 82_000, 'bank'],
    [20, E, 'EXPENSE', 'food', 'Fruits', 'Fruits', 9_000, 'cash'], [27, A, 'EXPENSE', 'food', 'Groceries', 'Groceries', 71_500, 'bank'], [41, E, 'EXPENSE', 'food', 'Groceries', 'Groceries', 69_000, 'bank'],
    [4, A, 'EXPENSE', 'bills', 'Prepaid electricity', 'Electricity', 25_000, 'momo'], [6, A, 'EXPENSE', 'bills', 'Internet', 'Family internet', 35_000, 'momo'], [9, E, 'EXPENSE', 'bills', 'Water', 'Water bill', 12_000, 'momo'],
    [32, A, 'EXPENSE', 'bills', 'Prepaid electricity', 'Electricity', 25_000, 'momo'], [38, A, 'EXPENSE', 'bills', 'Internet', 'Family internet', 35_000, 'momo'], [10, A, 'EXPENSE', 'bills', 'Rent', 'House rent', 450_000, 'bank'],
    [40, A, 'EXPENSE', 'bills', 'Rent', 'House rent', 450_000, 'bank'], [70, A, 'EXPENSE', 'bills', 'Rent', 'House rent', 450_000, 'bank'], [7, E, 'EXPENSE', 'health', 'School fees', 'Term fees for Kevin', 220_000, 'school'],
    [11, G, 'EXPENSE', 'health', 'School supplies', 'Notebooks and pens', 18_000, 'cash'], [16, E, 'EXPENSE', 'health', 'Pharmacy', 'Medicine for Kevin', 14_500, 'cash'], [29, A, 'EXPENSE', 'health', 'Doctor visit', 'Family doctor', 30_000, 'bank'],
    [19, E, 'EXPENSE', 'transport', 'Fuel', 'Family car fuel', 40_000, 'bank'], [25, A, 'EXPENSE', 'transport', 'Car repair', 'Brake pads', 65_000, 'bank'], [12, G, 'EXPENSE', 'transport', 'Moto-taxi', 'Moto to school', 1_500, 'cash'],
    [15, A, 'EXPENSE', 'entertainment', 'Cinema', 'Family movie night', 24_000, 'momo'], [22, E, 'EXPENSE', 'entertainment', 'Netflix', 'Netflix family plan', 9_500, 'momo'], [44, A, 'EXPENSE', 'gifts', 'Wedding gift', 'Wedding gift for cousin', 60_000, 'bank'],
    [28, A, 'EXPENSE', 'gifts', 'Tithe', 'Church offering', 30_000, 'cash'], [34, A, 'EXPENSE', 'shopping', 'Furniture', 'New dining chairs', 120_000, 'bank'], [50, E, 'EXPENSE', 'insurance', 'Health insurance', 'Family mutuelle', 90_000, 'bank'],
    [18, G, 'EXPENSE', 'shopping', 'Shoes', 'School shoes', 28_000, 'cash'],
  ];
  for (const [d, author, type, category, sub, title, amount, wk] of ft) {
    await tx({ clientId: author, familyId: F, walletId: fw[wk], type, category, subCategory: sub, title, amount, date: ago(d, 10 + (d % 7)), receipt: amount >= 100_000 && type === 'EXPENSE' });
  }
  await tx({ clientId: A, familyId: F, walletId: fw.bank, type: 'TRANSFER', category: 'other', title: 'Move to school fund', amount: 150_000, date: ago(18, 9), toWalletId: fw.school });
  for (const [offset, limit] of [[0, 1_000_000], [-1, 900_000], [-2, 850_000]] as const) {
    await prisma.budget.create({ data: { clientId: A, familyId: F, scopeKey: `f:${F}`, ...mm(offset), limit } });
  }
  const act = (days: number, actorId: string, action: string, targetId?: string, meta?: any) =>
    prisma.familyActivity.create({ data: { familyId: F, actorId, action, targetId: targetId ?? null, meta: meta ?? undefined, createdAt: ago(days, 10) } });
  await act(100, A, 'family.created', F, { name: 'Mwiza Family' });
  await act(95, E, 'member.joined', E); await act(90, G, 'member.joined', G); await act(80, O, 'member.joined', O);
  await act(92, A, 'member.role_changed', E, { from: 'MEMBER', to: 'ADMIN' });
  await act(60, K, 'member.joined', K);
  await act(35, O, 'member.left', O);
  await act(20, A, 'invite.revoked', undefined, { code: 'revoked' });
  await act(8, A, 'invite.created', pending.id, { role: 'MEMBER' });
  await act(5, A, 'family.updated', F, { currency: 'RWF' });

  // ── Write the balances the transactions add up to ──────────────────────────
  for (const [id, value] of balance) await prisma.wallet.update({ where: { id }, data: { balance: value } });

  // ── A summary ──────────────────────────────────────────────────────────────
  const count = async (clientId: string) => prisma.transaction.count({ where: { clientId, familyId: null } });
  console.log('\nDemo data is ready.\n');
  console.log(`  Sign in:  aline@${DOMAIN}  /  ${PASSWORD}     (also eric, grace, kevin, olivier @${DOMAIN})`);
  console.log(`  Aline:    ${await count(A)} personal transactions, ${await prisma.debt.count({ where: { clientId: A } })} loans & debts, ${await prisma.scheduledTransaction.count({ where: { clientId: A } })} schedules, ${await prisma.reminder.count({ where: { clientId: A } })} reminders, ${await prisma.notification.count({ where: { clientId: A } })} notifications`);
  console.log(`  Eric:     ${await count(E)} personal transactions`);
  console.log(`  Family:   Mwiza Family, ${await prisma.transaction.count({ where: { familyId: F } })} transactions, ${await prisma.wallet.count({ where: { familyId: F } })} wallets, 4 active members, ${await prisma.familyInvite.count({ where: { familyId: F } })} invites`);
  console.log(`  Pending invite code: ${pending.code}`);
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
