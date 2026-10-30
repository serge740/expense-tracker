// Ported from expo_app/context/scope-context.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@/lib/shims/async-storage';
import { getMyFamilies, type FamilyInfo, type FamilyLimits, type MyFamily } from '@/services/family.service';
import { can as roleCan, type FamilyAction, type FamilyRole } from '@/utils/family-permissions';
import { clearScopeOnSessionLoss, onSessionLost, setActiveFamilyId, setNotAMemberHandler } from '@/utils/family-scope-link';
import { decideLaunchScope, scopeKeyOf, stillInFamily, type ScopeKind } from '@/utils/family-scope-state';
import { clearPendingInvite } from '@/utils/pending-invite';

const STORAGE_KEY = 'family:scope';

export interface ScopeValue {
  /** False until the app has asked the server which family (if any) the person is in. */
  ready: boolean;
  scope: ScopeKind;
  /** True while standing in the family. */
  isFamily: boolean;
  /** The family the person last used (or the first one), whether or not they are standing in it right now. */
  family: FamilyInfo | null;
  /** Every family the person is in. */
  families: MyFamily[];
  role: FamilyRole | null;
  memberCount: number;
  limits: FamilyLimits | null;
  /** Changes on every switch; screens are keyed by it so they are rebuilt. */
  scopeKey: string;
  epoch: number;
  /** Set once when the person lost their family while using it. */
  notice: { kind: 'removed'; familyName: string | null } | null;
  clearNotice: () => void;
  /** Personal is never restricted; in a family the role decides. */
  can: (action: FamilyAction) => boolean;
  /** Move to Personal, or to a family (the given one, or the one used last). */
  switchTo: (scope: ScopeKind, familyId?: string) => Promise<void>;
  /** Ask the server again (after creating, joining, leaving, a role change). Returns the family or null. */
  refresh: () => Promise<MyFamily | null>;
}

/** What screens see when there is no provider (tests, or a screen shown outside the dashboard): plain Personal. */
export const PERSONAL_ONLY: ScopeValue = {
  ready: true, scope: 'personal', isFamily: false, family: null, families: [], role: null, memberCount: 0, limits: null, scopeKey: 'personal', epoch: 0,
  notice: null, clearNotice: () => {}, can: () => true, switchTo: async () => {}, refresh: async () => null,
};

const ScopeContext = createContext<ScopeValue>(PERSONAL_ONLY);
export const useScope = () => useContext(ScopeContext);

interface State { ready: boolean; scope: ScopeKind; mine: MyFamily | null; all: MyFamily[]; epoch: number; notice: ScopeValue['notice'] }
const INITIAL: State = { ready: false, scope: 'personal', mine: null, all: [], epoch: 0, notice: null };

/** The family to treat as "mine": the one asked for, else the one used last, else the first. */
const pickFamily = (all: MyFamily[], wanted: string | null | undefined): MyFamily | null => all.find(f => f.family.id === wanted) ?? all[0] ?? null;

async function readSaved(): Promise<string | null> {
  try { return (await AsyncStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
}
async function writeSaved(familyId: string | null) {
  try { familyId ? await AsyncStorage.setItem(STORAGE_KEY, familyId) : await AsyncStorage.removeItem(STORAGE_KEY); } catch { /* storage may be blocked */ }
}

/**
 * Where the person is standing: their own space, or their family. Lives inside the signed-in dashboard.
 * The header sent to the server is switched on the same tick as the state, before any screen is rebuilt.
 */
export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(INITIAL);
  const alive = useRef(true);
  const current = useRef<State>(INITIAL);
  current.current = state;

  const apply = useCallback((next: Partial<State>, familyId: string | null, bump: boolean) => {
    setActiveFamilyId(next.scope === 'family' || (next.scope === undefined && current.current.scope === 'family') ? familyId : null);
    setState(s => ({ ...s, ...next, epoch: bump ? s.epoch + 1 : s.epoch }));
  }, []);

  /** Back to Personal, once, with a notice (the person was removed, or their family was deleted). */
  const fallBack = useCallback((familyName: string | null, all: MyFamily[]) => {
    void writeSaved(null);
    setActiveFamilyId(null);
    if (alive.current) setState(s => ({ ...s, scope: 'personal', all, mine: pickFamily(all, null), ready: true, epoch: s.epoch + 1, notice: { kind: 'removed', familyName } }));
  }, []);

  // Launch: ask the server, then decide. Nothing is published as ready before that.
  useEffect(() => {
    alive.current = true;
    (async () => {
      const saved = await readSaved();
      let all: MyFamily[] = [];
      try { all = await getMyFamilies(); } catch { /* offline: start in Personal; the saved choice is kept for next time */ if (saved && alive.current) { setState(s => ({ ...s, ready: true })); return; } }
      if (!alive.current) return;
      const mine = pickFamily(all, saved);
      const { scope, removed } = decideLaunchScope(saved, mine);
      if (scope === 'family' && mine) {
        setActiveFamilyId(mine.family.id);
        setState(s => ({ ...s, ready: true, scope: 'family', mine, all, epoch: s.epoch + 1 }));
      } else {
        setActiveFamilyId(null);
        if (removed) void writeSaved(null);
        setState(s => ({ ...s, ready: true, scope: 'personal', mine, all, notice: removed ? { kind: 'removed', familyName: null } : s.notice, epoch: s.epoch + 1 }));
      }
    })();
    return () => { alive.current = false; setActiveFamilyId(null); };
  }, []);

  // The server said "you are not a member": the network layer has already switched the header off.
  useEffect(() => {
    setNotAMemberHandler(() => {
      const name = current.current.mine?.family.name ?? null;
      fallBack(name, []);
      void getMyFamilies().then(all => { if (alive.current) setState(s => ({ ...s, all, mine: pickFamily(all, null) })); }).catch(() => {});
    });
    return () => setNotAMemberHandler(null);
  }, [fallBack]);

  // Logging out, or a login that could not be renewed: forget everything about the family scope.
  useEffect(() => onSessionLost(() => {
    void writeSaved(null);
    void clearPendingInvite();
    if (alive.current) setState(INITIAL);
  }), []);

  const switchTo = useCallback(async (target: ScopeKind, familyId?: string) => {
    const { scope, all } = current.current;
    const mine = target === 'family' ? pickFamily(all, familyId ?? current.current.mine?.family.id) : current.current.mine;
    if (target === scope && (target === 'personal' || mine?.family.id === current.current.mine?.family.id)) return;
    if (target === 'family') {
      if (!mine) return;
      current.current = { ...current.current, scope: 'family', mine };
      await writeSaved(mine.family.id);
      apply({ scope: 'family', mine }, mine.family.id, true);
    } else {
      current.current = { ...current.current, scope: 'personal' };
      await writeSaved(null);
      apply({ scope: 'personal' }, null, true);
    }
  }, [apply]);

  const refresh = useCallback(async () => {
    const all = await getMyFamilies();
    const { scope, mine: before } = current.current;
    const mine = pickFamily(all, before?.family.id);
    if (!alive.current) return mine;
    if (scope === 'family' && !stillInFamily(before?.family.id ?? null, all.find(f => f.family.id === before?.family.id) ?? null)) {
      current.current = { ...current.current, scope: 'personal', all, mine };
      fallBack(before?.family.name ?? null, all);
    } else {
      // Also update the copy the next call reads, so "create, refresh, switch" works without waiting for a re-render.
      current.current = { ...current.current, all, mine };
      setState(s => ({ ...s, all, mine }));
    }
    return mine;
  }, [fallBack]);

  const value = useMemo<ScopeValue>(() => {
    const isFamily = state.scope === 'family' && !!state.mine;
    const role = state.mine?.role ?? null;
    return {
      ready: state.ready,
      scope: isFamily ? 'family' : 'personal',
      isFamily,
      family: state.mine?.family ?? null,
      families: state.all,
      role,
      memberCount: state.mine?.memberCount ?? 0,
      limits: state.mine?.limits ?? null,
      scopeKey: scopeKeyOf(isFamily ? 'family' : 'personal', state.mine?.family.id ?? null),
      epoch: state.epoch,
      notice: state.notice,
      clearNotice: () => setState(s => ({ ...s, notice: null })),
      can: (action: FamilyAction) => !isFamily || roleCan(role, action),
      switchTo,
      refresh,
    };
  }, [state, switchTo, refresh]);

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

/** Used by tests and by logout paths that are not driven by the network layer. */
export { clearScopeOnSessionLoss };
