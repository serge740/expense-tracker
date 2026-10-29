import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from '@/rn';
import { router } from '@/router/router';
import { useAppTheme } from '@/theme/theme-context';
import { useI18n } from '@/context/language-context';
import { FamilyNote, FamilyScreen } from '@/components/family/family-screen';
import { getToken } from '@/services/client-auth.service';
import type { InviteInput } from '@/services/family.service';
import { appJoinUrl } from '@/utils/family-invite';
import { clearPendingInvite, loadPendingInvite, savePendingInvite } from '@/utils/pending-invite';
import { captureJoinInvite, isPhoneBrowser } from '@/utils/join-link';

/**
 * The page an invite link opens (/join/<token>). It is public: the person may not have an account yet.
 *  1. It takes the secret out of the address bar at once and keeps it only for this tab.
 *  2. Signed in: straight on to the Join screen inside the app, which shows the invite and lets them join.
 *  3. Signed out: sign in or create an account first (the invite waits and opens right after).
 * The family's name is only shown after signing in, because looking an invite up counts as an attempt on the code.
 */
export default function JoinPage() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [state, setState] = useState<'checking' | 'signedOut' | 'none'>('checking');
  const [invite, setInvite] = useState<InviteInput | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      // The address is read and cleaned first; if the person reloads, the invite is found again in this tab's memory.
      const found = (await captureJoinInvite(window, savePendingInvite)) ?? (await loadPendingInvite());
      if (!alive) return;
      if (!found) { setState('none'); return; }
      setInvite(found);
      if (getToken()) { router.replace('/(dashboard)/family-join'); return; }
      setState('signedOut');
    })();
    return () => { alive = false; };
  }, []);

  const leave = async () => { await clearPendingInvite(); router.replace('/'); };
  const phone = isPhoneBrowser(typeof navigator !== 'undefined' ? navigator.userAgent : '');

  if (state === 'checking') {
    return (
      <View testID="join-checking" style={[s.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
        <Text style={[s.small, { color: theme.textMuted }]}>{t('family.joinpage.opening')}</Text>
      </View>
    );
  }

  return (
    <FamilyScreen title={t(state === 'none' ? 'family.joinpage.noneTitle' : 'family.joinpage.title')} onBack={leave}>
      {state === 'none' ? (
        <>
          <FamilyNote testID="join-none" text={t('family.joinpage.none')} />
          <TouchableOpacity testID="join-signin" onPress={() => router.push('/(auth)/login')} activeOpacity={0.85} style={[s.button, { backgroundColor: theme.buttonBg }]}>
            <Text style={s.buttonText}>{t('family.joinpage.signin')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <FamilyNote testID="join-signed-out" text={t('family.joinpage.body')} />
          {invite?.code ? <Text testID="join-code" style={[s.code, { color: theme.primary }]}>{t('family.joinpage.code', { code: invite.code })}</Text> : null}
          <TouchableOpacity testID="join-signin" onPress={() => router.push('/(auth)/login')} activeOpacity={0.85} style={[s.button, { backgroundColor: theme.buttonBg }]}>
            <Text style={s.buttonText}>{t('family.joinpage.signin')}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="join-register" onPress={() => router.push('/(auth)/register')} activeOpacity={0.85} style={[s.ghost, { borderColor: theme.border }]}>
            <Text style={[s.ghostText, { color: theme.text }]}>{t('family.joinpage.register')}</Text>
          </TouchableOpacity>
          {phone && invite ? (
            <>
              <TouchableOpacity testID="join-open-app" onPress={() => { window.location.href = appJoinUrl(invite); }} activeOpacity={0.85} style={[s.ghost, { borderColor: theme.border }]}>
                <Text style={[s.ghostText, { color: theme.text }]}>{t('family.joinpage.openApp')}</Text>
              </TouchableOpacity>
              <Text style={[s.small, { color: theme.textMuted }]}>{t('family.joinpage.appNote')}</Text>
            </>
          ) : null}
        </>
      )}
    </FamilyScreen>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  small: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 10 },
  code: { fontSize: 18, fontWeight: '800', letterSpacing: 3, textAlign: 'center', marginVertical: 12 },
  button: { marginTop: 14, borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  ghost: { marginTop: 10, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center' },
  ghostText: { fontSize: 14, fontWeight: '700' },
});
