import { FamilyAction, FamilyRoleName, can } from '../family-permissions';
import { errors } from '../family-errors';

/**
 * Where a request is "standing": the person's own space, or one family. It is resolved once per request from the
 * database (see ScopeService) and every wallet, transaction and budget query is built from it, so Personal and
 * Family money can never be mixed by accident.
 */
export interface PersonalScope { kind: 'personal'; clientId: string }
export interface FamilyScope {
  kind: 'family'; clientId: string; familyId: string; role: FamilyRoleName; currency: string; timezone: string;
}
export type Scope = PersonalScope | FamilyScope;

export const personalScope = (clientId: string): PersonalScope => ({ kind: 'personal', clientId });
export const isFamily = (s: Scope): s is FamilyScope => s.kind === 'family';

/**
 * The `where` for reading or changing rows of this scope. A personal request only ever sees rows with no family;
 * a family request sees the family's rows whoever wrote them, and never anyone's personal rows.
 */
export function scopeWhere(s: Scope): { clientId: string; familyId: null } | { familyId: string } {
  return s.kind === 'family' ? { familyId: s.familyId } : { clientId: s.clientId, familyId: null };
}

/** What to store on a new row: the author is always the caller, the family only when the request is in one. */
export function scopeData(s: Scope): { clientId: string; familyId: string | null } {
  return { clientId: s.clientId, familyId: s.kind === 'family' ? s.familyId : null };
}

/** Budgets are unique per scope and month, and a nullable column cannot say that on MySQL, so the scope is a key. */
export function scopeKeyOf(s: Scope): string {
  return s.kind === 'family' ? `f:${s.familyId}` : `p:${s.clientId}`;
}

/** The header value, if it can be a family id at all (the database decides whether it is real). */
const HEADER_SHAPE = /^[A-Za-z0-9-]{8,64}$/;
export function parseFamilyHeader(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw errors.badHeader();         // sent twice, or not a string
  const v = raw.trim();
  if (v === '') return null;                                      // an empty header means Personal, the safe default
  if (!HEADER_SHAPE.test(v)) throw errors.badHeader();
  return v;
}

/** Personal may do anything with its own money; in a family the role decides. */
export function assertScopeCan(s: Scope, action: FamilyAction): void {
  if (s.kind === 'family' && !can(s.role, action)) throw errors.forbidden();
}

export const scopeCan = (s: Scope, action: FamilyAction): boolean => s.kind === 'personal' || can(s.role, action);

/** Editing or deleting a family transaction: your own needs "edit own", someone else's needs "edit other". */
export function assertCanEditTransaction(s: Scope, authorId: string): void {
  if (s.kind === 'personal') return;
  assertScopeCan(s, authorId === s.clientId ? 'tx.edit.own' : 'tx.edit.other');
}
