import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { Tabs, router } from 'expo-router';
import { loadPendingInvite } from '@/utils/pending-invite';
import { CustomTabBar } from '@/components/custom-tab-bar';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { useScope } from '@/context/scope-context';
import { resetSettingsOnBlur } from '@/hooks/use-settings-back';

/**
 * The screens. They are keyed by the scope, so switching between Personal and a family rebuilds every one of them and each
 * fetches its own data: nothing from the other space can stay on screen. Push registration and notification handling live
 * above this (in DashboardLayout) and are not restarted by a switch.
 */
export function ScopedTabs() {
  const { ready, scopeKey, epoch, notice, clearNotice } = useScope();
  const theme = useAppTheme();
  const { t } = useI18n();

  // Told once when the person lost their family while using it.
  useEffect(() => {
    if (!notice) return;
    Alert.alert(t('family.removedTitle'), notice.familyName ? t('family.removedBody', { family: notice.familyName }) : t('family.removedBodyNoName'));
    clearNotice();
  }, [notice, clearNotice, t]);

  // An invite opened while signed out is waiting: open the Join screen with it, once, as soon as the dashboard is ready.
  const checkedPending = useRef(false);
  useEffect(() => {
    if (!ready || checkedPending.current) return;
    checkedPending.current = true;
    loadPendingInvite().then(p => { if (p) router.push('/(dashboard)/family-join' as any); }).catch(() => {});
  }, [ready]);

  // Nothing is shown until the server has said which family (if any) this person is in: no flash of the wrong space.
  if (!ready) {
    return <View testID="scope-loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}><ActivityIndicator color={theme.primary} /></View>;
  }

  return (
    <Tabs key={`${scopeKey}:${epoch}`} tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index"   />
      <Tabs.Screen name="wallets" />
      <Tabs.Screen name="debts"   />
      <Tabs.Screen name="profile" />
      {/* Hidden from tab bar — navigated to programmatically */}
      <Tabs.Screen name="add"        options={{ href: null }} />
      <Tabs.Screen name="scan"       options={{ href: null }} />
      <Tabs.Screen name="history"    options={{ href: null }} />
      <Tabs.Screen name="expense"       options={{ href: null }} />
      <Tabs.Screen name="wallet-detail" options={{ href: null }} />
      <Tabs.Screen name="transfer"      options={{ href: null }} />
      <Tabs.Screen name="reports"       options={{ href: null }} />
      <Tabs.Screen name="debt-ledger"   options={{ href: null }} />
      <Tabs.Screen name="scheduled"     options={{ href: null }} />
      <Tabs.Screen name="family"        options={{ href: null }} />
      <Tabs.Screen name="family-create"  options={{ href: null }} />
      <Tabs.Screen name="family-join"    options={{ href: null }} />
      {/* Leaving settings resets its stack so Back never hits a page from an earlier visit */}
      <Tabs.Screen name="(settings)" options={{ href: null }} listeners={resetSettingsOnBlur as any} />
    </Tabs>
  );
}
