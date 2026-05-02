import React, { useEffect, useState, useCallback } from 'react';
import {
  View, TouchableOpacity, StyleSheet, StatusBar, ScrollView,
  Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { logout, getMe, ClientProfile } from '@/services/client-auth.service';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { registerDevice } from '@/services/device.service';
import ENV from '@/env';
import { FadeInView } from '@/components/fade-in-view';
import { useThemePreference } from '@/context/theme-context';
import { useCurrency } from '@/context/currency-context';

type ActionItem = {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  sub: string;
  color: string;
  bg: string;
  onPress?: () => void;
};

export default function ProfileScreen() {
  const theme = useAppTheme();
  const { preference } = useThemePreference();
  const { currency } = useCurrency();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const load = useCallback(async () => {
    try { setProfile(await getMe()); }
    catch { /* handled */ }
    finally { setLoadingProfile(false); }
  }, []);

  useEffect(() => {
    load();
    registerDevice();
  }, [load]);

  const themeLabel = preference === 'system' ? 'System default' : preference === 'dark' ? 'Dark mode' : 'Light mode';
  const currencyLabel = `${currency.flag} ${currency.code} (${currency.symbol})`;

  const fullName = profile
    ? `${profile.firstName}${profile.lastName ? ' ' + profile.lastName : ''}`
    : 'Abigail Young';

  const email = profile?.email ?? 'abigail@hey.com';

  const initials = profile
    ? `${profile.firstName[0]}${profile.lastName?.[0] ?? ''}`.toUpperCase()
    : 'A';

  const avatarUri = profile?.profileImage
    ? (profile.profileImage.startsWith('http')
        ? profile.profileImage
        : `${ENV.UPLOADS_URL}/${profile.profileImage}`)
    : null;

  const ACTIONS: ActionItem[] = [
    { icon: 'document-scanner', label: 'Scan Receipt',      sub: 'Auto-log from photo',         color: '#7B7FD4', bg: 'rgba(123,127,212,0.12)', onPress: () => router.push('/(dashboard)/scan') },
    { icon: 'credit-card',      label: 'Payment Methods',   sub: 'Visa ··4821, Amex ··0092',    color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  onPress: () => router.push('/(dashboard)/(settings)/devices') },
    { icon: 'notifications',    label: 'Notifications',     sub: 'Budget alerts on',             color: '#FBBF24', bg: 'rgba(251,191,36,0.12)',  onPress: () => router.push('/(dashboard)/(settings)/notifications') },
    { icon: 'fingerprint',      label: 'Security',          sub: 'Biometric enabled',            color: '#4ADE80', bg: 'rgba(74,222,128,0.12)',  onPress: () => router.push('/(dashboard)/(settings)/profile') },
    { icon: 'person-outline',   label: 'Account Details',   sub: 'Edit your information',        color: '#F472B6', bg: 'rgba(244,114,182,0.12)', onPress: () => router.push('/(dashboard)/(settings)/profile') },
    { icon: 'attach-money',     label: 'Currency',          sub: currencyLabel,                  color: '#4ADE80', bg: 'rgba(74,222,128,0.12)',  onPress: () => router.push('/(dashboard)/(settings)/currency') },
    { icon: 'dark-mode',        label: 'Appearance',        sub: themeLabel,                     color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', onPress: () => router.push('/(dashboard)/(settings)/appearance') },
    { icon: 'help-outline',     label: 'Help & FAQ',        sub: 'Support & guides',             color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  onPress: () => router.push('/(dashboard)/(settings)/help') },
    { icon: 'privacy-tip',      label: 'Privacy Policy',    sub: 'Your data & rights',           color: '#F472B6', bg: 'rgba(244,114,182,0.12)', onPress: () => router.push('/(dashboard)/(settings)/privacy') },
    { icon: 'info-outline',     label: 'About App',         sub: 'Version 1.0.0',                color: '#94A3B8', bg: 'rgba(148,163,184,0.12)', onPress: () => router.push('/(dashboard)/(settings)/about') },
  ];

  const handleSignOut = async () => {
    try { await GoogleSignin.signOut(); } catch {}
    await logout();
    router.replace('/(auth)');
  };

  return (
    <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.headerBg }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.headerBg} />
      <ScrollView
        contentContainerStyle={[s.scroll, { backgroundColor: theme.background }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Header (deep koamaru) ── */}
        <View style={[s.header, { backgroundColor: theme.headerBg }]}>
          <View style={s.decA} />
          <View style={s.decB} />

          <FadeInView delay={0} slideFrom="top" distance={14}>
            <View style={s.topBar}>
              <Text style={s.screenTitle}>Profile</Text>
              <TouchableOpacity
                style={[s.editBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
                activeOpacity={0.75}
                onPress={() => router.push('/(dashboard)/(settings)/profile')}
              >
                <MaterialIcons name="edit" size={16} color="#FFFFFF" />
                <Text style={s.editText}>Edit</Text>
              </TouchableOpacity>
            </View>
          </FadeInView>

          {/* Avatar + name + email */}
          <FadeInView delay={60} slideFrom="bottom" distance={20}>
            <View style={s.avatarSection}>
              <View style={[s.avatarRing, { borderColor: 'rgba(255,255,255,0.25)' }]}>
                {loadingProfile ? (
                  <View style={[s.avatarCircle, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                ) : avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={s.avatarImg} />
                ) : (
                  <View style={[s.avatarCircle, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                    <Text style={s.avatarInitials}>{initials}</Text>
                  </View>
                )}
              </View>
              <Text style={s.profileName}>{fullName}</Text>
              <Text style={s.profileEmail}>{email}</Text>
              <View style={s.badgeRow}>
                <View style={s.planBadge}>
                  <Text style={s.planText}>Pro Plan</Text>
                </View>
                <View style={s.activeBadge}>
                  <View style={s.activeDot} />
                  <Text style={s.activeText}>Active</Text>
                </View>
              </View>
            </View>
          </FadeInView>

          {/* Stats strip */}
          <FadeInView delay={110} slideFrom="bottom" distance={16}>
            <View style={s.statsRow}>
              {[
                { label: 'SAVED',        value: '$12,840' },
                { label: 'TRANSACTIONS', value: '284'     },
                { label: 'STREAK',       value: '14d'     },
              ].map((stat, i) => (
                <View key={stat.label} style={[
                  s.statCard,
                  { backgroundColor: 'rgba(255,255,255,0.1)' },
                  i === 1 && s.statCardCenter,
                ]}>
                  <Text style={s.statVal}>{stat.value}</Text>
                  <Text style={s.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </FadeInView>
        </View>

        {/* ── Action list ── */}
        <FadeInView delay={180} slideFrom="bottom" distance={16}>
          <View style={[s.listCard, { backgroundColor: theme.surface }]}>
            {ACTIONS.map((item, i) => (
              <React.Fragment key={item.label}>
                <TouchableOpacity style={s.actionRow} activeOpacity={0.75} onPress={item.onPress}>
                  <View style={[s.actionIcon, { backgroundColor: item.bg }]}>
                    <MaterialIcons name={item.icon} size={20} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.actionLabel, { color: theme.text }]}>{item.label}</Text>
                    <Text style={[s.actionSub, { color: theme.textSecondary }]} numberOfLines={1}>{item.sub}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                </TouchableOpacity>
                {i < ACTIONS.length - 1 && (
                  <View style={[s.sep, { backgroundColor: theme.border }]} />
                )}
              </React.Fragment>
            ))}
          </View>
        </FadeInView>

        {/* Sign out */}
        <FadeInView delay={260} slideFrom="bottom" distance={14}>
          <TouchableOpacity
            style={[s.signOutBtn, { borderColor: 'rgba(248,113,113,0.25)', backgroundColor: 'rgba(248,113,113,0.08)' }]}
            activeOpacity={0.8}
            onPress={handleSignOut}
          >
            <MaterialIcons name="logout" size={20} color="#F87171" />
            <Text style={s.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </FadeInView>

        <Text style={[s.version, { color: theme.textMuted }]}>ABY Expense v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 40 },

  header: { paddingBottom: 28, overflow: 'hidden' },
  decA:   { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(255,255,255,0.05)', top: -80, right: -60 },
  decB:   { position: 'absolute', width: 180, height: 180, borderRadius: 90,  backgroundColor: 'rgba(255,255,255,0.04)', bottom: -40, left: -20 },

  topBar:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 10 },
  screenTitle:{ fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  editBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  editText:   { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },

  avatarSection: { alignItems: 'center', paddingTop: 6, paddingBottom: 20 },
  avatarRing:    { width: 96, height: 96, borderRadius: 48, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarCircle:  { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  avatarImg:     { width: 88, height: 88, borderRadius: 44 },
  avatarInitials:{ fontSize: 34, fontWeight: '800', color: '#FFFFFF' },
  profileName:   { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  profileEmail:  { fontSize: 14, color: 'rgba(255,255,255,0.55)', marginBottom: 12 },

  badgeRow:   { flexDirection: 'row', gap: 8 },
  planBadge:  { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.25)' },
  planText:   { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  activeBadge:{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(74,222,128,0.15)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' },
  activeDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80' },
  activeText: { fontSize: 12, fontWeight: '700', color: '#4ADE80' },

  statsRow:       { flexDirection: 'row', paddingHorizontal: 20, gap: 8 },
  statCard:       { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  statCardCenter: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 0 },
  statVal:        { fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginBottom: 3 },
  statLabel:      { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.8 },

  listCard:   { marginHorizontal: 20, borderRadius: 20, overflow: 'hidden', marginTop: 20 },
  actionRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  actionIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  actionLabel:{ fontSize: 15, fontWeight: '600', marginBottom: 2 },
  actionSub:  { fontSize: 12 },
  sep:        { height: 1, marginHorizontal: 16 },

  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 20, marginTop: 20, borderRadius: 16, paddingVertical: 14, gap: 10, borderWidth: 1 },
  signOutText:{ fontSize: 15, fontWeight: '600', color: '#F87171' },
  version:    { textAlign: 'center', fontSize: 12, marginTop: 16 },
});
