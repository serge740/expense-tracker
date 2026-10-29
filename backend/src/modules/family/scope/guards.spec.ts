import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { PersonalOnlyGuard } from './personal-only.guard';

const ctx = (headers: Record<string, unknown>) => ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as any;
const codeOf = (fn: () => unknown) => { try { fn(); return 'OK'; } catch (e: any) { return `${e.status}:${e.response?.code}`; } };

describe('PersonalOnlyGuard', () => {
  const guard = new PersonalOnlyGuard();
  test('passes a request with no family header, or an empty one', () => {
    expect(guard.canActivate(ctx({}))).toBe(true);
    expect(guard.canActivate(ctx({ 'x-family-id': '' }))).toBe(true);
    expect(guard.canActivate(ctx({ 'x-family-id': '   ' }))).toBe(true);
  });
  test('refuses a request that carries a family header with 400 PERSONAL_ONLY', () => {
    expect(codeOf(() => guard.canActivate(ctx({ 'x-family-id': 'fam-12345678' })))).toBe('400:PERSONAL_ONLY');
    expect(codeOf(() => guard.canActivate(ctx({ 'x-family-id': ['a', 'b'] })))).toBe('400:PERSONAL_ONLY');
  });
});

/**
 * Every controller has to decide where it stands on family scope. This reads the controllers and fails when a new one
 * is added without a decision, so "forgot the guard" cannot happen quietly.
 */
const MODULES = join(__dirname, '..', '..');
const SCOPED = ['wallet', 'transaction', 'budget', 'reports', 'home'];                   // use ScopeGuard
const PERSONAL_ONLY = ['debts', 'scheduled', 'reminders'];                                // use PersonalOnlyGuard
const PER_PERSON = ['notifications', 'devices', 'subcategories', 'receipts', 'client-auth', 'passkey', 'web-push', 'family', 'health', 'well-known'];

function controllers(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllers(full);
    return /\.controller\.ts$/.test(name) ? [full] : [];
  });
}

describe('every controller states where it stands on family scope', () => {
  const files = controllers(MODULES).map(f => ({ module: relative(MODULES, f).split(/[\\/]/)[0], text: readFileSync(f, 'utf8') }));

  test('the scan finds the controllers', () => {
    expect(files.length).toBeGreaterThan(15);
  });
  test('no controller is missing from the three lists (a new one must be placed)', () => {
    const known = new Set([...SCOPED, ...PERSONAL_ONLY, ...PER_PERSON]);
    expect(files.map(f => f.module).filter(m => !known.has(m))).toEqual([]);
  });
  test.each(SCOPED)('%s uses ScopeGuard', m => {
    for (const f of files.filter(x => x.module === m)) expect(f.text).toMatch(/UseGuards\([^)]*ScopeGuard/);
  });
  test.each(PERSONAL_ONLY)('%s uses PersonalOnlyGuard', m => {
    const own = files.filter(x => x.module === m);
    expect(own.some(f => /UseGuards\([^)]*PersonalOnlyGuard/.test(f.text))).toBe(true);
  });
  test('the scope-free controllers do not read the family header', () => {
    for (const f of files.filter(x => PER_PERSON.includes(x.module) && x.module !== 'family')) expect(f.text).not.toMatch(/x-family-id|ReqScope/i);
  });
});
