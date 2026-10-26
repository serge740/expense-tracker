import { useCallback } from 'react';
import { router } from '@/router/router';

/**
 * Back for a settings page: the previous page in the browser's history if there is one (Notifications → Inbox,
 * Verification → Edit profile …), otherwise the Profile tab, which is the settings hub.
 */
export function goBackInSettings() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(dashboard)/profile');
}

export function useSettingsBack() {
  return useCallback(() => goBackInSettings(), []);
}
