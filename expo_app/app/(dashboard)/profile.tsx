import React, { useCallback, useState } from 'react';
import {
  View, TouchableOpacity, StyleSheet, StatusBar, ScrollView, Image, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { logout, getMe, ClientProfile } from '@/services/client-auth.service';
import { GoogleSignin } from '@/services/google-signin';
import { getTransactions } from '@/services/transaction.service';
import { getWalletSummary } from '@/services/wallet.service';
import { getNotifications } from '@/services/notification.service';
import ENV from '@/env';
import { FadeInView } from '@/components/fade-in-view';
import { useThemePreference } from '@/context/theme-context';
import { useCurrency } from '@/context/currency-context';
import { usePreferences } from '@/context/preferences-context';
import { useI18n } from '@/context/language-context';
import { LANGUAGES } from '@/i18n/strings';
import { Section, Row, toneColors } from '@/components/settings/ui';

const AVATAR = 66;
const RING = 4;

const isPlaceholderPhone = (p?: string) => !p || /^(google|apple|facebook)_/.test(p);


export default function ProfileScreen() {
  const theme = useAppTheme();
  const { preference } = useThemePreference();
  const { currency } = useCurrency();
  const { prefs, formatTime } = usePreferences();
  const { t, language, formatDate } = useI18n();

  const [profile, setProfile]       = useState<ClientProfile | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [txCount, setTxCount]       = useState<number | null>(null);
  const [walletCount, setWalletCount] = useState<number | null>(null);
  const [unread, setUnread]         = useState(0);

  const load = useCallback(async () => {
    try {
      const [p, tx, wallets] = await Promise.all([
        getMe(),
        getTransactions({ limit: 1 }),
        getWalletSummary(),
      ]);
      setProfile(p);
      setTxCount(tx.total);
      setWalletCount(wallets.walletCount);
    } catch { /* handled by api interceptor */ }
    try { setUnread((await getNotifications(1, 1)).unreadCount); } catch { /* optional */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Reload whenever the tab gains focus (e.g. after verifying or editing).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Derived values ─────────────────────────────────────────────────────
  const fullName = profile ? `${profile.firstName}${profile.lastName ? ' ' + profile.lastName : ''}` : '';
  const initials = profile ? `${profile.firstName[0] ?? ''}${profile.lastName?.[0] ?? ''}`.toUpperCase() : '';
  const avatarUri = profile?.profileImage
    ? (profile.profileImage.startsWith('http') ? profile.profileImage : `${ENV.UPLOADS_URL}/${profile.profileImage}`)
    : null;
  // Verified only after the user entered a code we sent (not the legacy isVerified flag).
  const emailVerified = !!profile?.emailVerifiedAt;
  const phoneVerified = !!profile?.phoneVerifiedAt;
  const verified = emailVerified && phoneVerified;
  const verifiedCount = Number(emailVerified) + Number(phoneVerified);
  const hasPhone = !isPlaceholderPhone(profile?.phone);

  const checklist = [
    { done: !!profile, label: t('step.createAccount') },
    { done: emailVerified, label: t('step.verifyEmail'), verify: true },
    { done: hasPhone, label: t('step.addPhone') },
    { done: phoneVerified, label: t('step.verifyPhone'), verify: true },
    { done: !!profile?.profileImage, label: t('step.addPhoto') },
  ];
  const completion = Math.round((checklist.filter(c => c.done).length / checklist.length) * 100);
  const nextStep = checklist.find(c => !c.done);

  const memberSince = profile ? formatDate(profile.createdAt, { month: 'short', year: 'numeric' }) : '';
  const themeLabel = t(preference === 'system' ? 'theme.system' : preference === 'dark' ? 'theme.dark' : 'theme.light');
  const languageLabel = LANGUAGES.find(l => l.code === language);


  const handleSignOut = async () => {
    try { await GoogleSignin.signOut(); } catch {}
    await logout();
    router.replace('/(auth)/login');
  };

  const go = (path: string) => () => router.push(path as any);

  const gradient = theme.isDark ? ['#0B4A5E', '#071C24'] as const : ['#00627F', '#0A8AAB'] as const;

  // ── Avatar progress ring ───────────────────────────────────────────────
  const size = AVATAR + RING * 2 + 8;
  const r = (size - RING) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View style={[s.root, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={gradient[0]} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#fff" />}
      >
        {/* ── Header ── */}
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
          <View style={s.decA} />
          <View style={s.decB} />
          <SafeAreaView edges={['top']}>
            <View style={s.topBar}>
              <Text style={s.screenTitle}>{t('profile.title')}</Text>
              <TouchableOpacity style={s.bell} onPress={go('/(dashboard)/(settings)/notifications')} activeOpacity={0.75}>
                <MaterialIcons name="notifications-none" size={20} color="#FFFFFF" />
                {unread > 0 && <View style={s.bellDot} />}
              </TouchableOpacity>
            </View>

            <FadeInView delay={40} slideFrom="bottom" distance={16}>
              <View style={s.identity}>
                <TouchableOpacity
                  onPress={go('/(dashboard)/(settings)/edit-profile')}
                  activeOpacity={0.8}
                  style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
                    <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.18)" strokeWidth={RING} fill="none" />
                    <Circle
                      cx={size / 2} cy={size / 2} r={r}
                      stroke="#FFFFFF" strokeWidth={RING} fill="none" strokeLinecap="round"
                      strokeDasharray={`${circumference} ${circumference}`}
                      strokeDashoffset={circumference * (1 - completion / 100)}
                      transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    />
                  </Svg>
                  {loading && !profile ? (
                    <View style={s.avatar}><ActivityIndicator color="#fff" /></View>
                  ) : avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={s.avatar} />
                  ) : (
                    <View style={s.avatar}><Text style={s.initials}>{initials}</Text></View>
                  )}
                  <View style={[s.pctPill, { backgroundColor: theme.isDark ? '#0E2A33' : '#FFFFFF' }]}>
                    <Text style={[s.pctText, { color: theme.primary }]}>{completion}%</Text>
                  </View>
                </TouchableOpacity>

                <View style={s.identityText}>
                  <View style={s.nameRow}>
                    <Text style={s.name} numberOfLines={1}>{fullName || ' '}</Text>
                    {verified && <MaterialIcons name="verified" size={15} color="#7DD3FC" style={{ marginLeft: 4 }} />}
                  </View>
                  <Text style={s.email} numberOfLines={1}>{profile?.email ?? ''}</Text>
                  {memberSince ? <Text style={s.since}>{t('profile.memberSince', { date: memberSince })}</Text> : null}
                </View>
              </View>
            </FadeInView>
          </SafeAreaView>
        </LinearGradient>

        <View style={s.body}>

          {/* ── Completion ── */}
          {profile && (
            <FadeInView delay={90} slideFrom="bottom" distance={14}>
              <TouchableOpacity
                style={[s.progressCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={go(nextStep?.verify ? '/(dashboard)/(settings)/verify' : '/(dashboard)/(settings)/edit-profile')}
                activeOpacity={0.85}
              >
                <View style={s.progressHead}>
                  <Text style={[s.progressTitle, { color: theme.text }]}>
                    {completion === 100 ? t('profile.complete') : t('profile.percent', { pct: completion })}
                  </Text>
                  {nextStep
                    ? <Text style={[s.progressNext, { color: theme.primary }]}>{nextStep.label} ›</Text>
                    : <MaterialIcons name="check-circle" size={16} color={toneColors('ok', theme).fg} />}
                </View>
                <View style={[s.track, { backgroundColor: theme.primaryBg }]}>
                  <LinearGradient colors={['#00627F', '#22C3A6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.fill, { width: `${completion}%` }]} />
                </View>
              </TouchableOpacity>
            </FadeInView>
          )}

          {/* ── Verify banner ── */}
          {profile && !verified && (
            <FadeInView delay={130} slideFrom="bottom" distance={14}>
              <TouchableOpacity
                style={[s.banner, { backgroundColor: toneColors('warn', theme).bg, borderColor: theme.isDark ? 'rgba(251,191,36,0.3)' : '#FCD34D' }]}
                onPress={go('/(dashboard)/(settings)/verify')}
                activeOpacity={0.85}
              >
                <View style={s.bannerIcon}><Text style={s.bannerBang}>!</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.bannerTitle, { color: theme.text }]}>
                    {!emailVerified && !phoneVerified ? t('banner.verifyBoth') : !emailVerified ? t('step.verifyEmail') : t('step.verifyPhone')}
                  </Text>
                  <Text style={[s.bannerSub, { color: theme.textSecondary }]}>{t('banner.sub', { done: verifiedCount })}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            </FadeInView>
          )}

          <FadeInView delay={200} slideFrom="bottom" distance={14}>
            <Section title={t('section.account')}>
              <Row icon="person-outline" title={t('row.personalInfo')} sub={t('row.personalInfoSub')} onPress={go('/(dashboard)/(settings)/edit-profile')} />
              <Row icon="verified-user" title={t('row.verification')}
                   sub={t('row.verificationSub', { e: emailVerified ? '✓' : '✗', p: phoneVerified ? '✓' : '✗' })}
                   badge={verified ? { label: t('badge.verified'), tone: 'ok' } : { label: t('badge.actionNeeded', { done: verifiedCount }), tone: 'warn' }}
                   onPress={go('/(dashboard)/(settings)/verify')} />
              <Row icon="lock-outline" title={t('row.security')} sub={t('row.securitySub')} onPress={go('/(dashboard)/(settings)/security')} />
            </Section>

            <Section title={t('section.money')}>
              <Row icon="account-balance-wallet" title={t('row.wallets')}
                   sub={t('row.walletsSub', { w: walletCount ?? 0, t: txCount ?? 0 })} onPress={go('/(dashboard)/wallets')} />
              <Row icon="handshake" title={t('debts.title')} sub={t('debts.manageSub')} onPress={go('/(dashboard)/debts')} />
              <Row icon="event-repeat" title={t('sched.title')} sub={t('sched.rowSub')} onPress={go('/(dashboard)/scheduled')} />
              <Row icon="payments" title={t('row.currency')} value={`${currency.flag} ${currency.code}`} onPress={go('/(dashboard)/(settings)/currency')} />
            </Section>

            <Section title={t('section.app')}>
              <Row icon="notifications-none" title={t('row.notifications')}
                   sub={prefs.quietHours ? t('row.quiet', { from: formatTime(prefs.quietStart), to: formatTime(prefs.quietEnd) }) : t('row.notificationsSub')}
                   badge={unread > 0 ? { label: t('badge.new', { n: unread }), tone: 'info' } : undefined}
                   onPress={go('/(dashboard)/(settings)/notification-settings')} />
              <Row icon="palette" title={t('row.appearance')} value={themeLabel} onPress={go('/(dashboard)/(settings)/appearance')} />
              <Row icon="translate" title={t('row.language')}
                   value={languageLabel ? `${languageLabel.flag} ${languageLabel.native}` : ''}
                   onPress={go('/(dashboard)/(settings)/appearance')} />
              <Row icon="devices" title={t('row.devices')} sub={t('row.devicesSub')} onPress={go('/(dashboard)/(settings)/devices')} />
            </Section>

            <Section title={t('section.support')}>
              <Row icon="help-outline" title={t('row.help')} sub={t('row.helpSub')} onPress={go('/(dashboard)/(settings)/help')} />
              <Row icon="privacy-tip" title={t('row.privacy')} onPress={go('/(dashboard)/(settings)/privacy')} />
              <Row icon="info-outline" title={t('row.about')} onPress={go('/(dashboard)/(settings)/about')} />
            </Section>

            <TouchableOpacity
              style={[s.signOut, { borderColor: toneColors('danger', theme).fg + '55', backgroundColor: toneColors('danger', theme).bg }]}
              onPress={handleSignOut}
              activeOpacity={0.85}
            >
              <MaterialIcons name="logout" size={16} color={toneColors('danger', theme).fg} />
              <Text style={[s.signOutText, { color: toneColors('danger', theme).fg }]}>{t('signOut')}</Text>
            </TouchableOpacity>

            <Text style={[s.footer, { color: theme.textMuted }]}>
              Rabbit Tracker v1.0.0
            </Text>
          </FadeInView>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  header: { paddingBottom: 38, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden' },
  decA:   { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(255,255,255,0.06)', top: -90, right: -70 },
  decB:   { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.05)', bottom: -50, left: -40 },

  topBar:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 8 },
  screenTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  bell:        { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  bellDot:     { position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FBBF24', borderWidth: 1.5, borderColor: '#00627F' },

  identity: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 4 },
  identityText: { alignItems: 'center', marginTop: 10, maxWidth: '100%' },
  avatar:   { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  pctPill:  { position: 'absolute', bottom: -6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  pctText:  { fontSize: 9, fontWeight: '800' },

  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  name:    { fontSize: 15, fontWeight: '700', color: '#FFFFFF', flexShrink: 1 },
  email:   { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  since:   { fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 2 },

  body: { paddingHorizontal: 16, marginTop: -24 },

  banner:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 14 },
  bannerIcon:  { width: 30, height: 30, borderRadius: 9, backgroundColor: '#FBBF24', alignItems: 'center', justifyContent: 'center' },
  bannerBang:  { fontSize: 15, fontWeight: '800', color: '#3B2A00' },
  bannerTitle: { fontSize: 13, fontWeight: '700' },
  bannerSub:   { fontSize: 11, marginTop: 1 },

  progressCard:  { borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 14,
                   shadowColor: '#00627F', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 4 },
  progressHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressTitle: { fontSize: 12, fontWeight: '700' },
  progressNext:  { fontSize: 11, fontWeight: '600' },
  track:         { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill:          { height: '100%', borderRadius: 3 },

  signOut:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1, paddingVertical: 12, marginTop: 2 },
  signOutText: { fontSize: 13, fontWeight: '600' },
  footer:      { textAlign: 'center', fontSize: 11, marginTop: 14 },
});
