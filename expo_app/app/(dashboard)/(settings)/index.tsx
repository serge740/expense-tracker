import React, { ComponentProps } from 'react';
import { View, TouchableOpacity, StyleSheet, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

interface SettingItem {
  icon: IconName; iconColor: string; iconBg: string; label: string; onPress?: () => void;
}

const SECTIONS: { title: string; items: SettingItem[] }[] = [
  {
    title: 'Account',
    items: [
      { icon: 'person',                  iconColor: '#60A5FA', iconBg: 'rgba(96,165,250,0.15)',   label: 'Edit Profile',       onPress: () => router.push('/(dashboard)/(settings)/profile') },
      { icon: 'security',                iconColor: '#4ADE80', iconBg: 'rgba(74,222,128,0.15)',   label: 'Security & Password' },
      { icon: 'account-balance-wallet',  iconColor: '#A78BFA', iconBg: 'rgba(167,139,250,0.15)',  label: 'Payment Methods'     },
    ],
  },
  {
    title: 'Preferences',
    items: [
      { icon: 'notifications', iconColor: '#FBBF24', iconBg: 'rgba(251,191,36,0.15)',   label: 'Notifications' },
      { icon: 'attach-money',  iconColor: '#4ADE80', iconBg: 'rgba(74,222,128,0.15)',   label: 'Currency'      },
      { icon: 'dark-mode',     iconColor: '#94A3B8', iconBg: 'rgba(148,163,184,0.15)',  label: 'Appearance'    },
    ],
  },
  {
    title: 'Support',
    items: [
      { icon: 'help-outline',  iconColor: '#60A5FA', iconBg: 'rgba(96,165,250,0.15)',   label: 'Help & FAQ'      },
      { icon: 'privacy-tip',   iconColor: '#F472B6', iconBg: 'rgba(244,114,182,0.15)',  label: 'Privacy Policy'  },
      { icon: 'info-outline',  iconColor: '#94A3B8', iconBg: 'rgba(148,163,184,0.15)',  label: 'About App'       },
    ],
  },
];

export default function SettingsScreen() {
  const theme = useAppTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Settings</Text>
        </View>

        {/* Profile Card */}
        <TouchableOpacity style={[styles.profileCard, { backgroundColor: theme.primary }]} activeOpacity={0.8} onPress={() => router.push('/(dashboard)/(settings)/profile')}>
          <View style={styles.avatarContainer}>
            <MaterialIcons name="person" size={32} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>Alex Johnson</Text>
            <Text style={styles.profileEmail}>alex.johnson@email.com</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>

        {SECTIONS.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>{section.title}</Text>
            <View style={[styles.sectionCard, { backgroundColor: theme.surface }]}>
              {section.items.map((item, index) => (
                <React.Fragment key={item.label}>
                  <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={item.onPress}>
                    <View style={[styles.settingIconContainer, { backgroundColor: item.iconBg }]}>
                      <MaterialIcons name={item.icon} size={20} color={item.iconColor} />
                    </View>
                    <Text style={[styles.settingLabel, { color: theme.text }]}>{item.label}</Text>
                    <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                  </TouchableOpacity>
                  {index < section.items.length - 1 && <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />}
                </React.Fragment>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={[styles.logoutButton, { borderColor: 'rgba(248,113,113,0.25)', backgroundColor: 'rgba(248,113,113,0.08)' }]}
          activeOpacity={0.8}
          onPress={() => router.replace('/(auth)')}
        >
          <MaterialIcons name="logout" size={20} color="#F87171" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={[styles.versionText, { color: theme.textMuted }]}>ABY Expense v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 24, fontWeight: '700' },
  profileCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 16, marginBottom: 8, borderRadius: 20, padding: 18 },
  avatarContainer: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  profileName: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  profileEmail: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  section: { marginTop: 22, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  sectionCard: { borderRadius: 18, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  settingIconContainer: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  settingLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  rowDivider: { height: 1, marginLeft: 66 },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 20, marginTop: 28, borderRadius: 16, paddingVertical: 14, gap: 10, borderWidth: 1 },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#F87171' },
  versionText: { textAlign: 'center', fontSize: 12, marginTop: 20 },
});
