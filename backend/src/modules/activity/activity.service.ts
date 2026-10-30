import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Scope, isFamily, scopeKeyOf } from '../family/scope/scope';
import { displayName } from '../family/family.service';

export interface ActivityQuery { cursor?: string; limit?: string; entity?: string; entityId?: string; kinds?: string }
const ENTITIES = ['transaction', 'wallet', 'budget', 'debt', 'schedule', 'family'];
const MAX = 50;
export const KEEP_DAYS = 365;

/** The Activity timeline: what changed, newest first, for the space the person is in. Only what happened since it was switched on is here. */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: Scope, q: ActivityQuery) {
    const scopeKey0 = scopeKeyOf(scope);
    // Lines older than a year are dropped when someone reads the timeline.
    await this.prisma.activityEvent.deleteMany({ where: { scopeKey: scopeKey0, createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } });
    const take = Math.min(Math.max(parseInt(q.limit ?? '', 10) || 30, 1), MAX);
    const scopeKey = scopeKeyOf(scope);
    const kinds = (q.kinds ?? '').split(',').map(k => k.trim()).filter(Boolean).slice(0, 12);
    const [at, afterId] = (q.cursor ?? '').split('|');
    const cutoff = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : null;
    const where = {
      scopeKey,
      ...(q.entity && ENTITIES.includes(q.entity) ? { entity: q.entity } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(kinds.length ? { kind: { in: kinds } } : {}),
      ...(cutoff ? { OR: [{ createdAt: { lt: cutoff } }, { createdAt: cutoff, id: { lt: afterId ?? '' } }] } : {}),
    };
    const rows = await this.prisma.activityEvent.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1 });
    const page = rows.slice(0, take);

    const names = new Map<string, string>();
    if (isFamily(scope) && page.length) {
      const people = await this.prisma.client.findMany({ where: { id: { in: [...new Set(page.map(r => r.actorId))] } }, select: { id: true, firstName: true, lastName: true } });
      for (const c of people) names.set(c.id, displayName(c));
    }
    const deletedIds = page.filter(r => r.kind === 'transaction.deleted' && r.entityId).map(r => r.entityId as string);
    const trash = deletedIds.length ? await this.prisma.trashedTransaction.findMany({ where: { scopeKey, originalId: { in: deletedIds } }, select: { id: true, originalId: true }, orderBy: { deletedAt: 'desc' } }) : [];
    const trashOf = new Map<string, string>();
    for (const t of trash) if (!trashOf.has(t.originalId)) trashOf.set(t.originalId, t.id);

    const first = await this.prisma.activityEvent.findFirst({ where: { scopeKey }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
    const week = await this.prisma.activityEvent.findMany({ where: { scopeKey, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, select: { kind: true } });
    const count = (f: (k: string) => boolean) => week.filter(e => f(e.kind)).length;
    const last = page[page.length - 1];
    return {
      since: first?.createdAt ?? null,
      week: { total: week.length, added: count(k => k.endsWith('.created')), changed: count(k => k.endsWith('.edited') || k.endsWith('.set') || k.endsWith('.payment')), deleted: count(k => k.endsWith('.deleted')) },
      next: rows.length > take && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
      items: page.map(r => ({
        id: r.id, kind: r.kind, entity: r.entity, entityId: r.entityId, title: r.title,
        amount: r.amount === null ? null : Number(r.amount), currency: r.currency, changes: (r.changes as unknown) ?? null, createdAt: r.createdAt,
        ...(isFamily(scope) ? { actor: { name: names.get(r.actorId) ?? 'Former member', isYou: r.actorId === scope.clientId } } : {}),
        trashId: r.kind === 'transaction.deleted' && r.entityId ? trashOf.get(r.entityId) ?? null : null,
      })),
    };
  }
}
