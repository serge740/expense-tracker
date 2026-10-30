import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * The most important test of the family feature. A family transaction keeps its author in `clientId`, so any query that
 * filters wallets, transactions or budgets by `clientId` alone would silently include (or leak) family money.
 *
 * This reads the source and fails the build when a read, count, sum or bulk change on those three tables does not
 * go through the scope helpers (`scopeWhere`) or name `familyId` itself. A new query that forgets the scope fails here,
 * not in production.
 *
 * Anything on the allow-list below is reviewed by hand and says why it is safe.
 */
const SRC = join(__dirname, '..', '..', '..');
const MODELS = ['wallet', 'transaction', 'budget'];
const OPS = ['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany'];

/** `file` is relative to src; `snippet` must appear inside the call; `why` is the review note. */
const ALLOWED: Array<{ file: string; snippet: string; why: string }> = [
  { file: 'modules/debts/debts.service.ts', snippet: "{ where, orderBy: { date: 'desc' }, skip", why: 'The filter variable is built from clientId and debtId a few lines above (debt rows only)' },
  { file: 'modules/debts/debts.service.ts', snippet: '{ where }', why: 'Count over that same debt-only filter' },
  { file: 'modules/scheduled/scheduled.service.ts', snippet: 'select: { currency: true }', why: 'Reads the currency of the wallet the schedule already holds (checked as personal when the schedule was saved)' },
  { file: 'modules/transaction/transaction.service.ts', snippet: 'where: { id: existing.walletId }', why: 'Undoes a balance on the wallet of a transaction just loaded through assertInScope, so it is in the same scope' },
  { file: 'modules/transaction/transaction.service.ts', snippet: 'where: { id: existing.toWalletId }', why: 'Same, for the receiving side of a transfer' },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(full);
    return /\.ts$/.test(name) && !/\.(spec|fake)\.ts$/.test(name) ? [full] : [];
  });
}

/** The text of a call, from its opening parenthesis to the matching one. */
function callText(src: string, openAt: number): string {
  let depth = 0;
  for (let i = openAt; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(openAt, i + 1);
  }
  return src.slice(openAt);
}

interface Hit { file: string; line: number; call: string; text: string; before: string }

function findCalls(): Hit[] {
  const re = new RegExp(`\\.(${MODELS.join('|')})\\.(${OPS.join('|')})\\(`, 'g');
  const hits: Hit[] = [];
  for (const full of sourceFiles(SRC)) {
    const src = readFileSync(full, 'utf8');
    for (const m of src.matchAll(re)) {
      const at = m.index as number;
      hits.push({
        file: relative(SRC, full).replace(/\\/g, '/'),
        line: src.slice(0, at).split('\n').length,
        call: `${m[1]}.${m[2]}`,
        text: callText(src, at + m[0].length - 1),
        before: src.slice(Math.max(0, at - 2500), at),
      });
    }
  }
  return hits;
}

/** Budgets are scoped by their key (`p:<client>` or `f:<family>`); the other two by scopeWhere or an explicit familyId. */
const isScoped = (text: string) => /scopeWhere\(|familyId|scopeKeyOf\(|scopeKey\b/.test(text);

/** A call that just says `{ where, ... }` is scoped when the `where` it uses was built with the scope a few lines above. */
const bareWhere = (text: string) => /^\(\{\s*where\s*[,}]/.test(text);
const scopedByVariable = (h: Hit) => bareWhere(h.text) && /scopeWhere\(/.test(h.before);

const allowed = (h: Hit) => scopedByVariable(h) || ALLOWED.some(a => a.file === h.file && h.text.includes(a.snippet));

describe('leak guard: wallet, transaction and budget queries are always scoped', () => {
  const hits = findCalls();

  test('the scan finds the queries it is meant to guard', () => {
    expect(hits.length).toBeGreaterThan(30);
    expect(hits.some(h => h.file.endsWith('wallet/wallet.service.ts'))).toBe(true);
    expect(hits.some(h => h.file.endsWith('transaction/transaction.service.ts'))).toBe(true);
    expect(hits.some(h => h.file.endsWith('budget/budget.service.ts'))).toBe(true);
  });

  test('every such query uses the scope (scopeWhere) or names familyId, or is on the reviewed allow-list', () => {
    const bad = hits.filter(h => !isScoped(h.text) && !allowed(h));
    expect(bad.map(h => `${h.file}:${h.line}  ${h.call}  ${h.text.replace(/\s+/g, ' ').slice(0, 110)}`)).toEqual([]);
  });

  test('no query filters by clientId alone on a family-capable table', () => {
    const bad = hits.filter(h => /\bclientId\b/.test(h.text) && !isScoped(h.text) && !allowed(h));
    expect(bad.map(h => `${h.file}:${h.line}`)).toEqual([]);
  });

  test('the allow-list has no stale entries', () => {
    for (const a of ALLOWED) {
      const used = hits.some(h => h.file === a.file && h.text.includes(a.snippet) && !isScoped(h.text));
      expect(`${a.file} :: ${a.snippet} :: ${used}`).toBe(`${a.file} :: ${a.snippet} :: true`);
    }
  });
});

describe('leak guard: the guard itself works', () => {
  const sample = (text: string, before = ''): Hit => ({ file: 'x.ts', line: 1, call: 'wallet.findMany', text, before });
  test('a query that filters by clientId only is flagged', () => {
    expect(isScoped('({ where: { clientId } })')).toBe(false);
    expect(isScoped('({ where: { clientId, archived: false } })')).toBe(false);
    expect(allowed(sample('({ where: { clientId } })'))).toBe(false);
  });
  test('a query that uses the scope, or names familyId, passes', () => {
    expect(isScoped('({ where: { ...scopeWhere(scope), archived: false } })')).toBe(true);
    expect(isScoped('({ where: { id, clientId, familyId: null } })')).toBe(true);
    expect(isScoped('({ where: { scopeKey_month_year: { scopeKey, month, year } } })')).toBe(true);
  });
  test('a bare `where` variable passes only when the scope built it nearby', () => {
    expect(allowed(sample('({ where, orderBy: {} })', 'const where = { ...scopeWhere(scope) };'))).toBe(true);
    expect(allowed(sample('({ where, orderBy: {} })', 'const where = { clientId };'))).toBe(false);
  });
});
