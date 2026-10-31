import { Fragment, Suspense, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { ActivityIndicator, Alert, View } from '@/rn';
import { router } from '@/router/router';
import { useAppTheme } from '@/theme/theme-context';
import { useI18n } from '@/context/language-context';
import { useScope } from '@/context/scope-context';
import { loadPendingInvite } from '@/utils/pending-invite';
import { ScreenFallback } from '@/lib/lazy';

/**
 * The screen area of the dashboard. It is keyed by the scope, so switching between Personal and a family rebuilds the
 * screen and it asks for its own data: nothing from the other space can stay on screen. Push registration and the other
 * things the dashboard layout keeps running are above this and are not restarted by a switch.
 */
export function ScopedOutlet() {
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
    loadPendingInvite().then(p => { if (p) router.push('/(dashboard)/family-join'); }).catch(() => {});
  }, [ready]);

  // Nothing is shown until the server has said which family (if any) this person is in: no flash of the wrong space.
  if (!ready) {
    return <View testID="scope-loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}><ActivityIndicator color={theme.primary} /></View>;
  }
  return <Fragment key={`${scopeKey}:${epoch}`}><Suspense fallback={<ScreenFallback />}><Outlet /></Suspense></Fragment>;
}
