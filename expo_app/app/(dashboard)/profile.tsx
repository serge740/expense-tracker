import React, { ComponentProps, useEffect, useState, useCallback } from 'react';
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

type IconName = ComponentProps<typeof MaterialIcons>['name'];

interface SettingItem {
  icon: IconName; iconColor: string; iconBg: string; label: string; onPress?: () => void;
}

export default function SettingsScreen() {
  const theme = useAppTheme();
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

  const SECTIONS: { title: string; items: SettingItem[] }[] = [
    {
      title: 'Account',
      items: [
        { icon: 'person',                 iconColor: '#60A5FA', iconBg: 'rgba(96,165,250,0.15)',  label: 'Edit Profile',     onPress: () => router.push('/(dashboard)/(settings)/profile') },
        { icon: 'devices',                iconColor: '#4ADE80', iconBg: 'rgba(74,222,128,0.15)',  label: 'Devices',          onPress: () => router.push('/(dashboard)/(settings)/devices') },
        { icon: 'account-balance-wallet', iconColor: '#A78BFA', iconBg: 'rgba(167,139,250,0.15)', label: 'Payment Methods' },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { icon: 'notifications', iconColor: '#FBBF24', iconBg: 'rgba(251,191,36,0.15)',  label: 'Notifications', onPress: () => router.push('/(dashboard)/(settings)/notifications') },
        { icon: 'attach-money',  iconColor: '#4ADE80', iconBg: 'rgba(74,222,128,0.15)',  label: 'Currency' },
        { icon: 'dark-mode',     iconColor: '#94A3B8', iconBg: 'rgba(148,163,184,0.15)', label: 'Appearance' },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: 'help-outline', iconColor: '#60A5FA', iconBg: 'rgba(96,165,250,0.15)',  label: 'Help & FAQ' },
        { icon: 'privacy-tip',  iconColor: '#F472B6', iconBg: 'rgba(244,114,182,0.15)', label: 'Privacy Policy' },
        { icon: 'info-outline', iconColor: '#94A3B8', iconBg: 'rgba(148,163,184,0.15)', label: 'About App' },
      ],
    },
  ];

  const handleSignOut = async () => {
    try { await GoogleSignin.signOut(); } catch {}
    await logout();
    router.replace('/(auth)');
  };

  const fullName = profile
    ? `${profile.firstName}${profile.lastName ? ' ' + profile.lastName : ''}`
    : '';

  const initials = profile
    ? `${profile.firstName[0]}${profile.lastName?.[0] ?? ''}`.toUpperCase()
    : '?';

  const avatarUri = profile?.profileImage
    ? (profile.profileImage.startsWith('http')
        ? profile.profileImage
        : `${ENV.UPLOADS_URL}/${profile.profileImage}`)
    : null;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <FadeInView delay={40} slideFrom="top" distance={14}>
          <View style={s.header}>
            <Text style={[s.headerTitle, { color: theme.text }]}>Settings</Text>
          </View>
        </FadeInView>

        {/* Profile card */}
        <FadeInView delay={100} slideFrom="bottom" distance={20}>
        <TouchableOpacity
          style={[s.profileCard, { backgroundColor: theme.primary }]}
          activeOpacity={0.8}
          onPress={() => router.push('/(dashboard)/(settings)/profile')}
        >
          <View style={[s.avatarBox, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
            {loadingProfile ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : avatarUri ? (
              <Image source={{ uri: avatarUri }} style={s.avatarImg} />
            ) : (
              <Text style={s.avatarInitials}>{initials}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardName}>{fullName || 'View your profile'}</Text>
            <Text style={s.cardSub}>
              {profile?.email ?? 'Tap to see and edit your details'}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
        </FadeInView>

        {SECTIONS.map((section, si) => (
          <FadeInView key={section.title} delay={180 + si * 70} slideFrom="bottom" distance={18}>
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: theme.textMuted }]}>{section.title}</Text>
            <View style={[s.sectionCard, { backgroundColor: theme.surface }]}>
              {section.items.map((item, i) => (
                <React.Fragment key={item.label}>
                  <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={item.onPress}>
                    <View style={[s.rowIcon, { backgroundColor: item.iconBg }]}>
                      <MaterialIcons name={item.icon} size={20} color={item.iconColor} />
                    </View>
                    <Text style={[s.rowLabel, { color: theme.text }]}>{item.label}</Text>
                    <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                  </TouchableOpacity>
                  {i < section.items.length - 1 && (
                    <View style={[s.rowDivider, { backgroundColor: theme.border }]} />
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>
          </FadeInView>
        ))}

        <FadeInView delay={420} slideFrom="bottom" distance={16}>
        <TouchableOpacity
          style={[s.logoutBtn, { borderColor: 'rgba(248,113,113,0.25)', backgroundColor: 'rgba(248,113,113,0.08)' }]}
          activeOpacity={0.8}
          onPress={handleSignOut}
        >
          <MaterialIcons name="logout" size={20} color="#F87171" />
          <Text style={s.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        </FadeInView>

        <Text style={[s.version, { color: theme.textMuted }]}>ABY Expense v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1 },
  scroll:  { paddingBottom: 32 },
  header:  { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 24, fontWeight: '700' },

  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginTop: 16, marginBottom: 8,
    borderRadius: 20, padding: 18,
  },
  avatarBox: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 14, overflow: 'hidden',
  },
  avatarImg:      { width: 56, height: 56 },
  avatarInitials: { fontSize: 20, fontWeight: '800', color: '#fff' },
  cardName:    { fontSize: 17, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  cardSub:     { fontSize: 13, color: 'rgba(255,255,255,0.6)' },

  section:      { marginTop: 22, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  sectionCard:  { borderRadius: 18, overflow: 'hidden' },

  row:      { flexDirection: 'row', alignItems: 'center', padding: 14 },
  rowIcon:  { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  rowDivider: { height: 1, marginLeft: 66 },

  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 20, marginTop: 28, borderRadius: 16, paddingVertical: 14, gap: 10, borderWidth: 1 },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#F87171' },
  version:    { textAlign: 'center', fontSize: 12, marginTop: 20 },
});
