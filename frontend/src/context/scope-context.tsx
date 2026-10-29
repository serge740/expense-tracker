// Ported from expo_app/context/scope-context.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@/lib/shims/async-storage';
import { getMyFamily, type FamilyInfo, type FamilyLimits, type MyFamily } from '@/services/family.service';
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
  /** The person's family, whether or not they are standing in it right now. */
  family: FamilyInfo | null;
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
  switchTo: (scope: ScopeKind) => Promise<void>;
  /** Ask the server again (after creating, joining, leaving, a role change). Returns the family or null. */
  refresh: () => Promise<MyFamily | null>;
}

/** What screens see when there is no provider (tests, or a screen shown outside the dashboard): plain Personal. */
export const PERSONAL_ONLY: ScopeValue = {
  ready: true, scope: 'personal', isFamily: false, family: null, role: null, memberCount: 0, limits: null, scopeKey: 'personal', epoch: 0,
  notice: null, clearNotice: () => {}, can: () => true, switchTo: async () => {}, refresh: async () => null,
};

const ScopeContext = createContext<ScopeValue>(PERSONAL_ONLY);
export const useScope = () => useContext(ScopeContext);

interface State { ready: boolean; scope: ScopeKind; mine: MyFamily | null; epoch: number; notice: ScopeValue['notice'] }
const INITIAL: State = { ready: false, scope: 'personal', mine: null, epoch: 0, notice: null };

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
  const fallBack = useCallback((familyName: string | null, mine: MyFamily | null) => {
    void writeSaved(null);
    setActiveFamilyId(null);
    if (alive.current) setState(s => ({ ...s, scope: 'personal', mine, ready: true, epoch: s.epoch + 1, notice: { kind: 'removed', familyName } }));
  }, []);

  // Launch: ask the server, then decide. Nothing is published as ready before that.
  useEffect(() => {
    alive.current = true;
    (async () => {
      const saved = await readSaved();
      let mine: MyFamily | null = null;
      try { mine = await getMyFamily(); } catch { /* offline: start in Personal; the saved choice is kept for next time */ if (saved && alive.current) { setState(s => ({ ...s, ready: true })); return; } }
      if (!alive.current) return;
      const { scope, removed } = decideLaunchScope(saved, mine);
      if (scope === 'family' && mine) {
        setActiveFamilyId(mine.family.id);
        setState(s => ({ ...s, ready: true, scope: 'family', mine, epoch: s.epoch + 1 }));
      } else {
        setActiveFamilyId(null);
        if (removed) void writeSaved(null);
        setState(s => ({ ...s, ready: true, scope: 'personal', mine, notice: removed ? { kind: 'removed', familyName: null } : s.notice, epoch: s.epoch + 1 }));
      }
    })();
    return () => { alive.current = false; setActiveFamilyId(null); };
  }, []);

  // The server said "you are not a member": the network layer has already switched the header off.
  useEffect(() => {
    setNotAMemberHandler(() => {
      const name = current.current.mine?.family.name ?? null;
      fallBack(name, null);
      void getMyFamily().then(m => { if (alive.current) setState(s => ({ ...s, mine: m })); }).catch(() => {});
    });
    return () => setNotAMemberHandler(null);
  }, [fallBack]);

  // Logging out, or a login that could not be renewed: forget everything about the family scope.
  useEffect(() => onSessionLost(() => {
    void writeSaved(null);
    void clearPendingInvite();
    if (alive.current) setState(INITIAL);
  }), []);

  const switchTo = useCallback(async (target: ScopeKind) => {
    const { scope, mine } = current.current;
    if (target === scope) return;
    if (target === 'family') {
      if (!mine) return;
      current.current = { ...current.current, scope: 'family' };
      await writeSaved(mine.family.id);
      apply({ scope: 'family' }, mine.family.id, true);
    } else {
      current.current = { ...current.current, scope: 'personal' };
      await writeSaved(null);
      apply({ scope: 'personal' }, null, true);
    }
  }, [apply]);

  const refresh = useCallback(async () => {
    const mine = await getMyFamily();
    if (!alive.current) return mine;
    const { scope, mine: before } = current.current;
    if (scope === 'family' && !stillInFamily(before?.family.id ?? null, mine)) {
      current.current = { ...current.current, scope: 'personal', mine };
      fallBack(before?.family.name ?? null, mine);
    } else {
      // Also update the copy the next call reads, so "create, refresh, switch" works without waiting for a re-render.
      current.current = { ...current.current, mine };
      setState(s => ({ ...s, mine }));
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
