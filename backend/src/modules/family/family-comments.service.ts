import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FamilyAccessService } from './family-access.service';
import { errors } from './family-errors';
import { displayName } from './family.service';
import { NotificationsService } from '../notifications/notifications.service';

export const MAX_COMMENT = 500;

/** A short conversation under a family transaction. Anyone in the family can read and write; the author or an admin can delete. */
@Injectable()
export class FamilyCommentsService {
  constructor(private readonly prisma: PrismaService, private readonly access: FamilyAccessService, @Optional() private readonly notifications?: NotificationsService) {}

  private async transaction(familyId: string, id: string) {
    const t = await this.prisma.transaction.findFirst({ where: { id, familyId }, select: { id: true, clientId: true, title: true } });
    if (!t) throw new NotFoundException('Transaction not found');
    return t;
  }

  async list(clientId: string, familyId: string, transactionId: string) {
    await this.access.requireMember(clientId, familyId);
    await this.transaction(familyId, transactionId);
    const rows = await this.prisma.familyComment.findMany({ where: { familyId, transactionId }, orderBy: { createdAt: 'asc' }, take: 200 });
    const ids = [...new Set(rows.map(r => r.authorId))];
    const people = ids.length ? await this.prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const names = new Map(people.map(p => [p.id, displayName(p)]));
    return { items: rows.map(r => ({ id: r.id, body: r.body, createdAt: r.createdAt, author: { clientId: r.authorId, name: names.get(r.authorId) ?? 'Former member', isYou: r.authorId === clientId } })) };
  }

  async add(clientId: string, familyId: string, transactionId: string, dto: { body?: unknown }) {
    const m = await this.access.requireMember(clientId, familyId);
    this.access.assertCan(m, 'comment.add');
    const body = typeof dto.body === 'string' ? dto.body.trim() : '';
    if (!body || body.length > MAX_COMMENT) throw errors.invalid(`Write up to ${MAX_COMMENT} characters`);
    const t = await this.transaction(familyId, transactionId);
    await this.prisma.familyComment.create({ data: { familyId, transactionId, authorId: clientId, body } });
    // The person who added the transaction, and anyone who already commented, hear about it (never the commenter, never twice).
    try {
      const before = await this.prisma.familyComment.findMany({ where: { familyId, transactionId }, select: { authorId: true } });
      const who = new Set<string>([t.clientId, ...before.map(b => b.authorId)]);
      who.delete(clientId);
      if (who.size && this.notifications) {
        const me = await this.prisma.client.findUnique({ where: { id: clientId }, select: { firstName: true, lastName: true } });
        const off = new Set((await this.prisma.notificationPreference.findMany({ where: { clientId: { in: [...who] }, notifyFamily: false }, select: { clientId: true } })).map(p => p.clientId));
        for (const id of who) if (!off.has(id)) this.notifications.notify(id, `Comment on ${t.title}`, `${me ? displayName(me) : 'A member'}: ${body.slice(0, 80)}`, 'transaction', { familyId, transactionId });
      }
    } catch { /* a message that cannot be sent never undoes the comment */ }
    return this.list(clientId, familyId, transactionId);
  }

  async remove(clientId: string, familyId: string, commentId: string) {
    const m = await this.access.requireMember(clientId, familyId);
    const c = await this.prisma.familyComment.findFirst({ where: { id: commentId, familyId } });
    if (!c) throw new NotFoundException('Comment not found');
    if (c.authorId !== clientId) this.access.assertCan(m, 'comment.delete.other');
    await this.prisma.familyComment.delete({ where: { id: commentId } });
    return { success: true };
  }
}
