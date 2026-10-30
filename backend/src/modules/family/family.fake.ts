/**
 * A small in-memory stand-in for the parts of Prisma the family services use. It is only for tests and check scripts.
 * It enforces the same unique rules as the real tables (so the "one active family" and "one winner" guarantees are
 * really exercised) and rolls a $transaction back when the callback throws.
 */
type Row = Record<string, any>;

const UNIQUES: Record<string, string[][]> = {
  familyMember: [['id'], ['activeKey'], ['familyId', 'clientId']],
  familyInvite: [['id'], ['tokenHash'], ['code']],
  family: [['id']], familyActivity: [['id']], client: [['id']],
  wallet: [['id']], transaction: [['id']], trashedTransaction: [['id']], activityEvent: [['id']], budget: [['id'], ['scopeKey', 'month', 'year']],
};
const DEFAULTS: Record<string, () => Row> = {
  family: () => ({ currency: 'RWF', timezone: 'UTC', status: 'ACTIVE', archivedAt: null }),
  familyMember: () => ({ role: 'MEMBER', status: 'ACTIVE', nickname: null, leftAt: null, activeKey: null }),
  familyInvite: () => ({ role: 'MEMBER', status: 'PENDING', phone: null, email: null, acceptedBy: null, acceptedAt: null }),
  familyActivity: () => ({ targetId: null, meta: null }),
  client: () => ({}),
  wallet: () => ({ familyId: null, archived: false, walletType: 'CHECKING', balance: 0, isDefault: false, accountNumber: null, accountHolder: null, last4: null, currency: 'RWF', color: '#0F2F3A' }),
  trashedTransaction: () => ({ deletedAt: new Date() }),
  activityEvent: () => ({ createdAt: new Date() }),
  transaction: () => ({ familyId: null, walletId: null, toWalletId: null, description: null, subCategory: null, receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null, fundedByDebtId: null, scheduledOccurrenceId: null, toAmount: null, exchangeRate: null }),
  budget: () => ({ familyId: null }),
};

/** Writes a value the way the database would: a Decimal becomes a number, and increment / decrement change the old value. */
function written(old: any, v: any): any {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('increment' in v) return Number(old ?? 0) + Number(v.increment);
    if ('decrement' in v) return Number(old ?? 0) - Number(v.decrement);
    if (typeof v.toNumber === 'function') return v.toNumber();
  }
  return v;
}
function applyData(row: Row, data: Row): Row {
  const out = { ...row };
  for (const [k, v] of Object.entries(data)) if (v !== undefined) out[k] = written(row[k], v);
  return out;
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Row[]).some(w => matches(row, w));
    if (k === 'AND') return (v as Row[]).every(w => matches(row, w));
    if (k === 'NOT') return !matches(row, v);
    if (v === undefined) return true;                 // like Prisma, an undefined filter is ignored
    const val = row[k] ?? null;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return (v.in as any[]).includes(val);
      if ('notIn' in v) return !(v.notIn as any[]).includes(val);
      if ('contains' in v) return typeof val === 'string' && val.toLowerCase().includes(String(v.contains).toLowerCase());
      if ('gt' in v) return val > v.gt;
      if ('gte' in v) return val >= v.gte;
      if ('lt' in v) return val < v.lt;
      if ('lte' in v) return val <= v.lte;
      if ('not' in v) return val !== v.not;
    }
    if (v instanceof Date) return val instanceof Date && val.getTime() === v.getTime();
    return val === v;
  });
}

export class FamilyFakePrisma {
  private seq = 0;
  tables: Record<string, Row[]> = { client: [], family: [], familyMember: [], familyInvite: [], familyActivity: [], wallet: [], transaction: [], budget: [], trashedTransaction: [], activityEvent: [] };
  /** Called with the table name before every write, so a test can make two requests interleave. */
  beforeWrite?: (table: string) => Promise<void> | void;

  addClient(c: Row) { this.tables.client.push({ isActive: true, emailVerifiedAt: new Date(), phoneVerifiedAt: null, ...c }); return c.id as string; }

  private uniqueCheck(table: string, row: Row, ignore?: Row) {
    for (const cols of UNIQUES[table] ?? []) {
      if (cols.some(c => row[c] === null || row[c] === undefined)) continue;
      const clash = this.tables[table].find(r => r !== ignore && cols.every(c => r[c] === row[c]));
      if (clash) throw Object.assign(new Error(`Unique constraint failed on ${table}(${cols.join(',')})`), { code: 'P2002' });
    }
  }

  private model(table: string) {
    const rows = () => this.tables[table];
    const find = (where: Row) => {
      // A compound unique such as familyId_clientId / scopeKey_month_year arrives as one nested object: flatten it.
      const flat: Row = {};
      for (const [k, v] of Object.entries(where)) {
        if (k.includes('_') && v && typeof v === 'object' && !(v instanceof Date)) Object.assign(flat, v); else flat[k] = v;
      }
      return rows().find(r => matches(r, flat)) ?? null;
    };
    return {
      findUnique: async ({ where }: { where: Row }) => { const r = find(where); return r ? { ...r } : null; },
      findFirst: async ({ where }: { where?: Row } = {}) => { const r = rows().find(x => matches(x, where)); return r ? { ...r } : null; },
      findMany: async ({ where, orderBy, take }: { where?: Row; orderBy?: Row | Row[]; take?: number } = {}) => {
        let out = rows().filter(r => matches(r, where)).map(r => ({ ...r }));
        const ord = ([] as Row[]).concat(orderBy ?? []);
        for (const o of ord.reverse()) { const [k, dir] = Object.entries(o)[0] as [string, string]; out = out.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }
        return take ? out.slice(0, take) : out;
      },
      count: async ({ where }: { where?: Row } = {}) => rows().filter(r => matches(r, where)).length,
      create: async ({ data }: { data: Row }) => {
        await this.beforeWrite?.(table);
        const n = ++this.seq;
        // Strictly increasing times, so "newest first" is never a tie between two rows made in the same millisecond.
        const row = applyData({ id: `${table}-${n}`, createdAt: new Date(Date.now() + n), updatedAt: new Date(), ...DEFAULTS[table]() }, data);
        this.uniqueCheck(table, row);
        rows().push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        await this.beforeWrite?.(table);
        const r = find(where);
        if (!r) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
        const next = { ...applyData(r, data), updatedAt: new Date() };
        this.uniqueCheck(table, next, r);
        Object.assign(r, next);
        return { ...r };
      },
      upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
        const self: any = this.model(table);
        return find(where) ? self.update({ where, data: update }) : self.create({ data: create });
      },
      delete: async ({ where }: { where: Row }) => {
        await this.beforeWrite?.(table);
        const r = find(where);
        if (!r) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
        rows().splice(rows().indexOf(r), 1);
        return { ...r };
      },
      deleteMany: async ({ where }: { where?: Row } = {}) => {
        await this.beforeWrite?.(table);
        const hit = rows().filter(r => matches(r, where));
        for (const r of hit) rows().splice(rows().indexOf(r), 1);
        return { count: hit.length };
      },
      aggregate: async ({ where, _sum }: { where?: Row; _sum?: Row }) => {
        const hit = rows().filter(r => matches(r, where));
        const sum: Row = {};
        for (const k of Object.keys(_sum ?? {})) sum[k] = hit.length ? hit.reduce((a, r) => a + Number(r[k] ?? 0), 0) : null;
        return { _sum: sum };
      },
      groupBy: async ({ by, where, _sum }: { by: string[]; where?: Row; _sum?: Row }) => {
        const groups = new Map<string, Row[]>();
        for (const r of rows().filter(x => matches(x, where))) { const key = by.map(b => r[b]).join('|'); groups.set(key, [...(groups.get(key) ?? []), r]); }
        return [...groups.values()].map(g => ({ ...Object.fromEntries(by.map(b => [b, g[0][b]])), _sum: Object.fromEntries(Object.keys(_sum ?? {}).map(k => [k, g.reduce((a, r) => a + Number(r[k] ?? 0), 0)])) }));
      },
      updateMany: async ({ where, data }: { where?: Row; data: Row }) => {
        await this.beforeWrite?.(table);
        const hit = rows().filter(r => matches(r, where));
        for (const r of hit) { const next = applyData(r, data); this.uniqueCheck(table, next, r); Object.assign(r, next); }
        return { count: hit.length };
      },
    };
  }

  client = this.model('client');
  family = this.model('family');
  familyMember = this.model('familyMember');
  familyInvite = this.model('familyInvite');
  familyActivity = this.model('familyActivity');
  wallet = this.model('wallet');
  transaction = this.model('transaction');
  trashedTransaction = this.model('trashedTransaction');
  activityEvent = this.model('activityEvent');
  budget = this.model('budget');

  private lock: Promise<unknown> = Promise.resolve();

  /** Transactions run one after another, like row locks making conflicting writers wait for each other. */
  $transaction<T>(fn: (tx: FamilyFakePrisma) => Promise<T>): Promise<T> {
    const run = this.lock.then(() => this.runTx(fn), () => this.runTx(fn));
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async runTx<T>(fn: (tx: FamilyFakePrisma) => Promise<T>): Promise<T> {
    const snapshot = JSON.stringify(this.tables);
    const dates = (_k: string, v: any) => v;
    try { return await fn(this); }
    catch (e) {
      const before = JSON.parse(snapshot, (k, v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : dates(k, v)));
      for (const t of Object.keys(this.tables)) this.tables[t].splice(0, this.tables[t].length, ...before[t]);
      throw e;
    }
  }
}

import { FamilyAccessService } from './family-access.service';
import { FamilyInvitesService } from './family-invites.service';
import { FamilyService } from './family.service';
import { ScopeService } from './scope/scope.service';
import { WalletService } from '../wallet/wallet.service';
import { TransactionService } from '../transaction/transaction.service';
import { BudgetService } from '../budget/budget.service';

/** The real services wired to the in-memory database, plus five people who are all verified by default. */
export function makeWorld() {
  const db = new FamilyFakePrisma();
  const access = new FamilyAccessService(db as any);
  const families = new FamilyService(db as any, access);
  const invites = new FamilyInvitesService(db as any, access, families);
  const scopes = new ScopeService(access);
  const fx = { rate: async (a: string, b: string) => (a === b ? 1 : 2), ratesFor: async (base: string, codes: string[]) => Object.fromEntries(codes.map(c => [c, 1])), updatedAt: null };
  const notified: unknown[][] = [];
  const wallets = new WalletService(db as any, fx as any, { notify: (...a: unknown[]) => { notified.push(a); } } as any);
  const transactions = new TransactionService(db as any, { notify: (...a: unknown[]) => { notified.push(a); } } as any);
  const budgets = new BudgetService(db as any);
  const people: Record<string, string> = {};
  ['Aline', 'Eric', 'Grace', 'Kevin', 'Divine'].forEach((first, i) => {
    const id = first.toLowerCase();
    people[id] = db.addClient({ id, firstName: first, lastName: 'Uwase', email: `${id}@example.com`, phone: `+2507800000${i}` });
  });
  /** Makes a family owned by `owner` and adds the others by invite, so tests start from the real path. */
  const join = async (familyId: string, ownerId: string, who: Array<[string, 'ADMIN' | 'MEMBER' | 'VIEWER']>) => {
    for (const [id, role] of who) {
      const inv = await invites.create(ownerId, familyId, { role });
      await invites.accept(id, { code: inv.code });
    }
  };
  /** The scope a request from `who` would have: Personal, or the family when its id is given. */
  const scopeOf = (who: string, familyId?: string) => scopes.resolve(who, familyId);
  return { db, access, families, invites, join, scopes, scopeOf, wallets, transactions, budgets, notified };
}
