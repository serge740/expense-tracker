import { ConflictException, ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Scope, isFamily, scopeData, scopeKeyOf } from '../family/scope/scope';
import { MAX_VIEWS, parseSavedView } from './feed';

/** Named filters on History. A person's own are private; a family's belong to the family (anyone in it may add one, the maker or an admin removes it). */
@Injectable()
export class SavedViewsService {
  constructor(private readonly prisma: PrismaService) {}

  private shape = (v: { id: string; name: string; filter: unknown; clientId: string; createdAt: Date }, scope: Scope) => ({
    id: v.id, name: v.name, filter: v.filter, createdAt: v.createdAt, mine: v.clientId === scope.clientId,
  });

  async list(scope: Scope) {
    const rows = await this.prisma.savedView.findMany({ where: { scopeKey: scopeKeyOf(scope) }, orderBy: { createdAt: 'asc' }, take: MAX_VIEWS });
    return rows.map(v => this.shape(v, scope));
  }

  async create(scope: Scope, body: unknown) {
    const view = parseSavedView(body);
    if (!view) throw new BadRequestException('Give the view a name');
    const key = scopeKeyOf(scope);
    if ((await this.prisma.savedView.count({ where: { scopeKey: key } })) >= MAX_VIEWS) throw new BadRequestException(`You can keep up to ${MAX_VIEWS} saved views`);
    if (await this.prisma.savedView.findFirst({ where: { scopeKey: key, name: view.name } })) throw new ConflictException('A saved view with that name already exists');
    const row = await this.prisma.savedView.create({ data: { ...scopeData(scope), scopeKey: key, name: view.name, filter: view.filter as object } });
    return this.shape(row, scope);
  }

  async rename(scope: Scope, id: string, body: unknown) {
    const row = await this.owned(scope, id);
    const parsed = parseSavedView({ name: (body as { name?: unknown } | null)?.name, filter: {} });
    if (!parsed) throw new BadRequestException('Give the view a name');
    if (parsed.name !== row.name && (await this.prisma.savedView.findFirst({ where: { scopeKey: row.scopeKey, name: parsed.name } }))) throw new ConflictException('A saved view with that name already exists');
    return this.shape(await this.prisma.savedView.update({ where: { id }, data: { name: parsed.name } }), scope);
  }

  async remove(scope: Scope, id: string) {
    await this.owned(scope, id);
    await this.prisma.savedView.delete({ where: { id } });
    return { success: true };
  }

  /** The view, if it is in this space and this person may change it (they made it, or they run the family). */
  private async owned(scope: Scope, id: string) {
    const row = await this.prisma.savedView.findFirst({ where: { id, scopeKey: scopeKeyOf(scope) } });
    if (!row) throw new NotFoundException('Saved view not found');
    const admin = isFamily(scope) && (scope.role === 'OWNER' || scope.role === 'ADMIN');
    if (row.clientId !== scope.clientId && !admin) throw new ForbiddenException('Only the person who saved it, or a family admin, can change it');
    return row;
  }
}
