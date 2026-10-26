// Ported from expo_app/app/(dashboard)/(settings)/security.tsx
import React, { useEffect, useState } from 'react';
import { Alert } from '@/rn';
import { router } from '@/router/router';
import { getMe, logout, ClientProfile } from '@/services/client-auth.service';
import { SettingsScreen, Section, Row, Hint } from '@/components/settings/ui';
import { GoogleIcon } from '@/components/auth/ui';
import { useI18n } from '@/context/language-context';

export default function SecurityScreen() {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    getMe().then(setProfile).catch(() => { /* offline: keep empty state */ });
  }, []);

  const linked = (v?: string | null) => (v ? { label: t('badge.connected'), tone: 'ok' as const } : { label: t('badge.notLinked'), tone: 'muted' as const });

  const signOut = () =>
    Alert.alert(t('signOut'), t('security.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('signOut'), style: 'destructive', onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);

  return (
    <SettingsScreen title={t('security.title')} subtitle={t('security.subtitle')}>
      <Section title={t('section.password')}>
        <Row icon="lock-reset" title={t('security.change')} sub={t('security.changeSub')}
             onPress={() => router.push('/(auth)/forgot-password')} />
      </Section>

      <Section title={t('section.signin')}>
        <Row icon="alternate-email" title={t('security.emailPassword')} sub={profile?.email ?? '—'} badge={{ label: t('badge.primary'), tone: 'info' }} />
        <Row icon="login" leading={<GoogleIcon size={16} />} title="Google" badge={linked(profile?.googleId)} />
        <Row icon="apple" title="Apple" badge={linked(profile?.appleId)} />
        <Row icon="facebook" title="Facebook" badge={linked(profile?.facebookId)} />
      </Section>
      <Hint>{t('security.linkHint')}</Hint>

      <Section title={t('section.passkeys')}>
        <Row icon="fingerprint" title={t('security.passkeys')} sub={t('security.passkeysSub')}
             onPress={() => router.push('/(dashboard)/(settings)/passkeys')} />
      </Section>

      <Section title={t('section.devices')}>
        <Row icon="devices" title={t('security.devices')} sub={t('security.devicesSub')} onPress={() => router.push('/(dashboard)/(settings)/devices')} />
        <Row icon="logout" title={t('security.signOutDevice')} onPress={signOut} danger />
      </Section>
    </SettingsScreen>
  );
}
