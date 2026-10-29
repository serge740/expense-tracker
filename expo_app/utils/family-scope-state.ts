import type { MyFamily } from '@/services/family.service';

export type ScopeKind = 'personal' | 'family';

/**
 * What to show when the app opens. The saved choice is only a wish: the server decides. Family is restored only when the
 * person is still a member of exactly the family they last used; anything else is Personal, and if they had been in a
 * family it is reported as "removed" so the app can say so once.
 */
export function decideLaunchScope(savedFamilyId: string | null, mine: MyFamily | null): { scope: ScopeKind; removed: boolean } {
  if (savedFamilyId && mine && mine.family.id === savedFamilyId) return { scope: 'family', removed: false };
  return { scope: 'personal', removed: !!savedFamilyId };
}

/** Changes whenever the scope does; the screens are keyed by it so they are rebuilt (and refetch) on a switch. */
export const scopeKeyOf = (scope: ScopeKind, familyId: string | null): string => (scope === 'family' && familyId ? `family:${familyId}` : 'personal');

/** After refreshing "my family" while standing in Family: is the person still where they think they are? */
export function stillInFamily(currentFamilyId: string | null, mine: MyFamily | null): boolean {
  return !!currentFamilyId && !!mine && mine.family.id === currentFamilyId;
}
