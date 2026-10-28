import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** A person's own list of subcategories: what they typed or picked before. Never visible to anyone else. */
@Injectable()
export class SubCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Everything this account has used, most recently used first. */
  async list(clientId: string) {
    const rows = await this.prisma.userSubCategory.findMany({
      where: { clientId },
      orderBy: [{ lastUsedAt: 'desc' }, { name: 'asc' }],
      take: 1000,
    });
    return rows.map(r => ({ id: r.id, kind: r.kind, category: r.category, name: r.name, usageCount: r.usageCount, lastUsedAt: r.lastUsedAt }));
  }

  /**
   * Takes one off the list ("Edit" in Yours). Transactions already saved with it are not touched; it simply stops being
   * offered, until it is used again.
   */
  async remove(clientId: string, id: string) {
    // The account is part of the match, so nobody can remove somebody else's row by guessing an id.
    const { count } = await this.prisma.userSubCategory.deleteMany({ where: { id, clientId } });
    if (count === 0) throw new NotFoundException('That subcategory is not in your list');
    return { success: true };
  }
}
