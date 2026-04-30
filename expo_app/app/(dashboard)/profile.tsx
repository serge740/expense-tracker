import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

interface SettingItem { icon: IconName; title: string; subtitle: string; }

const SETTINGS: SettingItem[] = [
  { icon: 'document-scanner', title: 'Scan Receipt',     subtitle: 'Auto-log from photo'             },
  { icon: 'credit-card',      title: 'Payment Methods',  subtitle: 'Visa ··4821, Amex ··0092'        },
  { icon: 'notifications',    title: 'Notifications',    subtitle: 'Budget alerts enabled'            },
  { icon: 'lock',             title: 'Security',         subtitle: 'Biometric enabled'                },
];

const STATS = [
  { value: '$12,840', label: 'Saved'        },
  { value: '284',     label: 'Transactions' },
  { value: '14 days', label: 'Streak'       },
];

export default function ProfileScreen() {
  const theme = useAppTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <Text style={[styles.headerTitle, { color: theme.text }]}>Profile</Text>

        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: theme.surface }]}>
          <View style={styles.profileTop}>
            <View style={[styles.avatarCircle, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarLetter}>A</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: theme.text }]}>Abigail Young</Text>
              <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>abigail@hey.com</Text>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: theme.primaryBg }]}>
                  <Text style={[styles.badgeText, { color: theme.primary }]}>Pro Plan</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
                  <Text style={[styles.badgeText, { color: '#22C55E' }]}>Active</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Stats */}
          <View style={[styles.statsRow, { borderTopColor: theme.border }]}>
            {STATS.map((s, i) => (
              <React.Fragment key={s.label}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: theme.primary }]}>{s.value}</Text>
                  <Text style={[styles.statLabel, { color: theme.textMuted }]}>{s.label}</Text>
                </View>
                {i < STATS.length - 1 && <View style={[styles.statSep, { backgroundColor: theme.border }]} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Settings items */}
        <View style={[styles.settingsCard, { backgroundColor: theme.surface }]}>
          {SETTINGS.map((item, index) => (
            <React.Fragment key={item.title}>
              <TouchableOpacity
                style={styles.settingRow}
                activeOpacity={0.7}
                onPress={item.title === 'Scan Receipt' ? () => router.push('/(dashboard)/scan') : undefined}
              >
                <View style={[styles.settingIconBox, { backgroundColor: theme.primaryBg }]}>
                  <MaterialIcons name={item.icon} size={20} color={theme.primary} />
                </View>
                <View style={styles.settingText}>
                  <Text style={[styles.settingTitle, { color: theme.text }]}>{item.title}</Text>
                  <Text style={[styles.settingSub, { color: theme.textSecondary }]}>{item.subtitle}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              </TouchableOpacity>
              {index < SETTINGS.length - 1 && <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />}
            </React.Fragment>
          ))}
        </View>

        {/* Sign out */}
        <TouchableOpacity
          style={[styles.signOutButton, { borderColor: 'rgba(239,68,68,0.25)', backgroundColor: 'rgba(239,68,68,0.06)' }]}
          activeOpacity={0.8}
          onPress={() => router.replace('/(auth)')}
        >
          <MaterialIcons name="logout" size={18} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  headerTitle: { fontSize: 24, fontWeight: '800', paddingHorizontal: 20, paddingTop: 16, marginBottom: 16 },

  profileCard: { marginHorizontal: 20, borderRadius: 20, overflow: 'hidden', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  profileTop: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14 },
  avatarCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  profileEmail: { fontSize: 13, marginBottom: 8 },
  badgeRow: { flexDirection: 'row', gap: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  statsRow: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 14 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 11 },
  statSep: { width: 1, marginVertical: 4 },

  settingsCard: { marginHorizontal: 20, borderRadius: 18, overflow: 'hidden', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  settingRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  settingIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  settingText: { flex: 1 },
  settingTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  settingSub: { fontSize: 12 },
  rowDivider: { height: 1, marginLeft: 70 },

  signOutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 20, borderRadius: 14, paddingVertical: 14, gap: 8, borderWidth: 1 },
  signOutText: { fontSize: 15, fontWeight: '600', color: '#EF4444' },
});
