import { Scope, scopeKeyOf } from '../family/scope/scope';

export type ActivityKind =
  | 'transaction.created' | 'transaction.edited' | 'transaction.deleted' | 'transaction.restored'
  | 'wallet.created' | 'wallet.edited' | 'wallet.deleted' | 'wallet.transfer'
  | 'budget.set'
  | 'debt.created' | 'debt.payment' | 'debt.payment_removed' | 'debt.written_off' | 'debt.reopened' | 'debt.archived' | 'debt.restored' | 'debt.deleted'
  | `family.${string}`
  | 'schedule.created' | 'schedule.edited' | 'schedule.paused' | 'schedule.resumed' | 'schedule.ended';
export type ActivityEntity = 'transaction' | 'wallet' | 'budget' | 'debt' | 'schedule' | 'family';
export interface ActivityChange { field: string; from: string | number | null; to: string | number | null }
export interface ActivityInput {
  kind: ActivityKind; entity: ActivityEntity; entityId?: string | null; title: string;
  amount?: number | null; currency?: string | null; changes?: ActivityChange[];
}
/** Anything that can create an `ActivityEvent` row: the Prisma client, or a transaction client. */
export interface ActivityDb { activityEvent: { create(args: { data: Record<string, unknown> }): Promise<unknown> } }

const plain = (v: unknown): string | number | null => {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number' || typeof v === 'string') return v;
  return String(v);
};

/** The fields whose value really changed, as before → after. */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>, fields: string[]): ActivityChange[] {
  const out: ActivityChange[] = [];
  for (const f of fields) {
    const a = plain(before[f] !== null && typeof before[f] === 'object' && 'toNumber' in (before[f] as object) ? Number(before[f]) : before[f]);
    const b = plain(after[f] !== null && typeof after[f] === 'object' && 'toNumber' in (after[f] as object) ? Number(after[f]) : after[f]);
    if (a !== b) out.push({ field: f, from: a, to: b });
  }
  return out;
}

/** Writes one line of the Activity timeline. A failure here must never undo or fail the thing that was done, so it is swallowed. */
export async function recordActivity(db: ActivityDb, scope: Scope, e: ActivityInput): Promise<void> {
  try {
    await db.activityEvent.create({
      data: {
        clientId: scope.clientId, familyId: scope.kind === 'family' ? scope.familyId : null, scopeKey: scopeKeyOf(scope), actorId: scope.clientId,
        kind: e.kind, entity: e.entity, entityId: e.entityId ?? null, title: e.title.slice(0, 190),
        amount: e.amount ?? null, currency: e.currency ?? null, changes: e.changes?.length ? e.changes : undefined,
      },
    });
  } catch { /* the timeline is a record, not part of the money */ }
}
