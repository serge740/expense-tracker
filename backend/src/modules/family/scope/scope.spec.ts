import { makeWorld } from '../family.fake';
import { ScopeService } from './scope.service';
import { ScopeGuard } from './scope.guard';
import {
  FamilyScope, Scope, assertCanEditTransaction, assertScopeCan, parseFamilyHeader, personalScope, scopeCan, scopeData, scopeKeyOf, scopeWhere,
} from './scope';

const codeOf = async (p: Promise<unknown> | (() => unknown)) => {
  try { await (typeof p === 'function' ? p() : p); return 'OK'; } catch (e: any) { return e?.response?.code ?? e?.message ?? 'ERR'; }
};
const fam = (role: FamilyScope['role'], clientId = 'grace'): FamilyScope => ({ kind: 'family', clientId, familyId: 'fam-12345678', role, currency: 'RWF', timezone: 'UTC' });

describe('what a scope turns into', () => {
  test('a personal scope only sees its own rows that have no family', () => {
    expect(scopeWhere(personalScope('aline'))).toEqual({ clientId: 'aline', familyId: null });
  });
  test('a family scope sees the family rows whoever wrote them, and never filters by person', () => {
    expect(scopeWhere(fam('MEMBER'))).toEqual({ familyId: 'fam-12345678' });
    expect(scopeWhere(fam('MEMBER'))).not.toHaveProperty('clientId');
  });
  test('new rows are authored by the caller and carry the family only inside one', () => {
    expect(scopeData(personalScope('aline'))).toEqual({ clientId: 'aline', familyId: null });
    expect(scopeData(fam('MEMBER', 'grace'))).toEqual({ clientId: 'grace', familyId: 'fam-12345678' });
  });
  test('budget keys differ per scope, so a member has a personal and a family budget for one month', () => {
    expect(scopeKeyOf(personalScope('grace'))).toBe('p:grace');
    expect(scopeKeyOf(fam('MEMBER'))).toBe('f:fam-12345678');
    expect(scopeKeyOf(personalScope('grace'))).not.toBe(scopeKeyOf(fam('MEMBER')));
  });
});

describe('the family header', () => {
  test.each([[undefined], [null], [''], ['   ']])('%p means Personal', raw => {
    expect(parseFamilyHeader(raw)).toBeNull();
  });
  test('a plausible id passes through trimmed', () => {
    expect(parseFamilyHeader(' 1f0c8e2a-5b7d-4c1e-9a3f-0b6d2e8f4a11 ')).toBe('1f0c8e2a-5b7d-4c1e-9a3f-0b6d2e8f4a11');
  });
  test.each([['short'], ['has spaces in it nope'], ["x'; DROP TABLE Family;--"], ['a'.repeat(65)], [['a', 'b']], [123], [{}]])('%p is a bad header', raw => {
    expect(() => parseFamilyHeader(raw)).toThrow();
    try { parseFamilyHeader(raw); } catch (e: any) { expect(e.response.code).toBe('BAD_FAMILY_HEADER'); }
  });
});

describe('what a role may do inside a scope', () => {
  test('Personal is never restricted', () => {
    const p: Scope = personalScope('aline');
    expect(() => assertScopeCan(p, 'wallet.delete')).not.toThrow();
    expect(scopeCan(p, 'budget.set')).toBe(true);
    expect(() => assertCanEditTransaction(p, 'someone-else')).not.toThrow();
  });
  test('a Viewer cannot add; a Member can add but not manage wallets; an Admin can; only the Owner deletes wallets', async () => {
    expect(scopeCan(fam('VIEWER'), 'tx.add')).toBe(false);
    expect(scopeCan(fam('MEMBER'), 'tx.add')).toBe(true);
    expect(scopeCan(fam('MEMBER'), 'wallet.manage')).toBe(false);
    expect(scopeCan(fam('ADMIN'), 'wallet.manage')).toBe(true);
    expect(scopeCan(fam('ADMIN'), 'wallet.delete')).toBe(false);
    expect(scopeCan(fam('OWNER'), 'wallet.delete')).toBe(true);
    expect(await codeOf(() => assertScopeCan(fam('VIEWER'), 'tx.add'))).toBe('FORBIDDEN_ACTION');
  });
  test('a Member edits their own transactions but not other people\'s; an Admin edits anyone\'s', async () => {
    expect(await codeOf(() => assertCanEditTransaction(fam('MEMBER', 'grace'), 'grace'))).toBe('OK');
    expect(await codeOf(() => assertCanEditTransaction(fam('MEMBER', 'grace'), 'eric'))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(() => assertCanEditTransaction(fam('ADMIN', 'eric'), 'grace'))).toBe('OK');
    expect(await codeOf(() => assertCanEditTransaction(fam('VIEWER', 'kevin'), 'kevin'))).toBe('FORBIDDEN_ACTION');
  });
});

describe('ScopeService.resolve (always from the database)', () => {
  async function world() {
    const w = makeWorld();
    const { family } = await w.families.create('aline', { name: 'Mwiza' });
    await w.join(family.id, 'aline', [['eric', 'ADMIN'], ['grace', 'MEMBER'], ['kevin', 'VIEWER']]);
    return { w, id: family.id as string, scopes: new ScopeService(w.access) };
  }

  test('no header is Personal, even for someone who is in a family', async () => {
    const { scopes } = await world();
    expect(await scopes.resolve('grace', undefined)).toEqual({ kind: 'personal', clientId: 'grace' });
    expect(await scopes.resolve('divine', undefined)).toEqual({ kind: 'personal', clientId: 'divine' });
  });
  test('a member asking for their family gets it, with their role', async () => {
    const { scopes, id } = await world();
    expect(await scopes.resolve('kevin', id)).toMatchObject({ kind: 'family', familyId: id, role: 'VIEWER', clientId: 'kevin' });
    expect(await scopes.resolve('aline', id)).toMatchObject({ role: 'OWNER' });
  });
  test('a stranger, and someone in another family, are refused with the same answer', async () => {
    const { w, id, scopes } = await world();
    await w.families.create('divine', { name: 'Other' });
    expect(await codeOf(scopes.resolve('divine', id))).toBe('NOT_A_MEMBER');
    const { id: other } = { id: (await w.families.mine('divine'))!.family.id };
    expect(await codeOf(scopes.resolve('grace', other))).toBe('NOT_A_MEMBER');
  });
  test('a family that does not exist gives the same answer as one you are not in', async () => {
    const { scopes } = await world();
    expect(await codeOf(scopes.resolve('grace', 'does-not-exist-123'))).toBe('NOT_A_MEMBER');
  });
  test('a malformed header is a 400, not a database lookup', async () => {
    const { scopes } = await world();
    expect(await codeOf(scopes.resolve('grace', 'no'))).toBe('BAD_FAMILY_HEADER');
  });
  test('a member who was removed is refused on their very next request', async () => {
    const { w, id, scopes } = await world();
    expect(await codeOf(scopes.resolve('grace', id))).toBe('OK');
    await w.families.removeMember('aline', id, 'grace');
    expect(await codeOf(scopes.resolve('grace', id))).toBe('NOT_A_MEMBER');
  });
  test('an archived family is refused for everyone, the owner included', async () => {
    const { w, id, scopes } = await world();
    await w.families.archive('aline', id, 'Mwiza');
    expect(await codeOf(scopes.resolve('aline', id))).toBe('NOT_A_MEMBER');
  });
});

describe('ScopeGuard', () => {
  const ctx = (req: any) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as any;

  test('stores the resolved scope on the request', async () => {
    const w = makeWorld();
    const { family } = await w.families.create('aline', { name: 'Mwiza' });
    const guard = new ScopeGuard(new ScopeService(w.access));
    const req: any = { client: { id: 'aline' }, headers: { 'x-family-id': family.id } };
    expect(await guard.canActivate(ctx(req))).toBe(true);
    expect(req.scope).toMatchObject({ kind: 'family', role: 'OWNER' });
    const plain: any = { client: { id: 'aline' }, headers: {} };
    await guard.canActivate(ctx(plain));
    expect(plain.scope).toEqual({ kind: 'personal', clientId: 'aline' });
  });
  test('refuses to run before the login guard', async () => {
    const guard = new ScopeGuard(new ScopeService(makeWorld().access));
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toThrow();
  });
});
