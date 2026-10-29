// Ported from expo_app/utils/family-format.ts
import type { ActivityRow } from '@/services/family.service';

type T = (key: any, vars?: Record<string, string | number>) => string;

/** Up to two capital letters from a name: "Aline Uwase" → "AU", "Grace" → "G". */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const letters = parts.length === 1 ? [...parts[0]].slice(0, 1) : [[...parts[0]][0], [...parts[parts.length - 1]][0]];
  return letters.join('').toUpperCase();
}

const PALETTE = ['#00627F', '#B45309', '#0F766E', '#7C3AED', '#BE185D', '#1D4ED8', '#047857', '#9A3412'];

/** The same person always gets the same colour, so a list is easy to scan. */
export function colorFor(id: string | null | undefined): string {
  let h = 0;
  for (const ch of id ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** One sentence for one line of the family's history, in the person's language. */
export function activityText(row: ActivityRow, t: T): string {
  const actor = row.actor?.name || t('family.act.someone');
  const target = row.target?.name || t('family.act.someone');
  const role = typeof row.meta?.to === 'string' ? t(`role.${row.meta.to}` as any) : typeof row.meta?.role === 'string' ? t(`role.${row.meta.role}` as any) : '';
  switch (row.action) {
    case 'family.created': return t('family.act.created', { actor });
    case 'family.updated': return t('family.act.updated', { actor });
    case 'family.archived': return t('family.act.archived', { actor });
    case 'member.joined': return t('family.act.joined', { actor });
    case 'member.left': return t('family.act.left', { actor });
    case 'member.removed': return t('family.act.removed', { actor, target });
    case 'member.role_changed': return t('family.act.roleChanged', { actor, target, role });
    case 'ownership.transferred': return t('family.act.transferred', { actor, target });
    case 'invite.created': return t('family.act.inviteCreated', { actor, role });
    case 'invite.revoked': return t('family.act.inviteRevoked', { actor });
    case 'invite.revoked_all': return t('family.act.inviteRevokedAll', { actor });
    default: return t('family.act.other', { actor });
  }
}

/** "in 3 days", "tomorrow", "today", "expired": how long an invite has left. */
export function daysLeft(expiresAt: string, now = Date.now()): number {
  return Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000);
}
