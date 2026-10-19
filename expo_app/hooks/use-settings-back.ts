import { useCallback } from 'react';
import { router, useNavigation } from 'expo-router';

type StackNav = {
  getState: () => { index?: number; routes: { name: string }[] } | undefined;
  goBack: () => void;
};

/**
 * Back for screens inside (settings), given that screen's own navigation:
 * pop to the previous settings page if there is one (Notifications → Inbox,
 * Verification → Edit profile …), otherwise return to the Profile tab — the
 * settings hub — instead of falling back to Home.
 *
 * Reads the stack's live state at press time (never a cached snapshot, which
 * can be partial right after a deep push and lose the real position).
 */
export function settingsBack(navigation: StackNav) {
  const state = navigation.getState();
  const index = state?.index ?? (state ? state.routes.length - 1 : 0);
  const prev = index > 0 ? state?.routes[index - 1] : undefined;
  if (prev && prev.name !== 'index') navigation.goBack();
  else router.navigate('/(dashboard)/profile');
}

/** Hook form for settings screens (uses the screen's own stack navigation). */
export function useSettingsBack() {
  const navigation = useNavigation() as unknown as StackNav;
  return useCallback(() => settingsBack(navigation), [navigation]);
}

type TabNav = {
  getState: () => { routes: { name: string; state?: { key?: string } }[] };
  dispatch: (action: object) => void;
};

/**
 * Tabs.Screen `listeners` for the hidden (settings) tab: whenever you leave
 * settings, reset its stack to just `index`. Pages opened from the Profile tab
 * then always sit on a clean base, so Back never lands on a page left over
 * from an earlier visit.
 */
export const resetSettingsOnBlur = ({ navigation }: { navigation: TabNav }) => ({
  blur: () => {
    const settings = navigation.getState().routes.find(r => r.name === '(settings)');
    const target = settings?.state?.key;
    if (!target) return;
    navigation.dispatch({ type: 'RESET', payload: { index: 0, routes: [{ name: 'index' }] }, target });
  },
});
