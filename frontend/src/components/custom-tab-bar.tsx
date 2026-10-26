import { View, Text, TouchableOpacity, StyleSheet, MaterialIcons, useSafeAreaInsets } from '@/rn';
import { router, usePathname } from '@/router/router';
import { stripAppPrefix } from '@/router/paths';
import { useAppTheme } from '@/theme/theme-context';
import { useI18n } from '@/context/language-context';
import type { StringKey } from '@/i18n/strings';

const TABS: { name: string; path: string; icon: string; label: StringKey }[] = [
  { name: 'index', path: '/(dashboard)', icon: 'home', label: 'tab.home' },
  { name: 'wallets', path: '/(dashboard)/wallets', icon: 'account-balance-wallet', label: 'tab.wallets' },
  { name: 'debts', path: '/(dashboard)/debts', icon: 'handshake', label: 'tab.debts' },
  { name: 'profile', path: '/(dashboard)/profile', icon: 'settings', label: 'tab.settings' },
];

/** Which tab the address belongs to; hidden screens (add, history, …) light up none, like the phone app. */
export function activeTab(pathname: string): string | null {
  const p = stripAppPrefix(pathname);
  if (p === '/' || p === '') return 'index';
  const first = p.split('/').filter(Boolean)[0];
  return TABS.some(t => t.name === first) ? first : null;
}

export function CustomTabBar() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const active = activeTab(usePathname());

  const renderTab = (tab: (typeof TABS)[number]) => {
    const focused = active === tab.name;
    const color = focused ? theme.primary : theme.textMuted;
    return (
      <TouchableOpacity
        key={tab.name} style={styles.tab} activeOpacity={0.7} accessibilityRole="tab" accessibilityLabel={t(tab.label)}
        onPress={() => { if (!focused) router.navigate(tab.path); }}
      >
        <MaterialIcons name={tab.icon} size={24} color={color} />
        <Text style={[styles.tabLabel, { color }]}>{t(tab.label)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.container, { backgroundColor: theme.tabBar, borderTopColor: theme.tabBorder, paddingBottom: insets.bottom, height: TAB_BUTTON_AREA + insets.bottom }]}
    >
      {TABS.slice(0, 2).map(renderTab)}

      {/* FAB */}
      <View style={styles.fabWrapper}>
        <TouchableOpacity style={[styles.fab, { backgroundColor: theme.primary }]} activeOpacity={0.85} accessibilityLabel="Add" onPress={() => router.push('/(dashboard)/add')}>
          <MaterialIcons name="add" size={30} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {TABS.slice(2).map(renderTab)}
    </View>
  );
}

const TAB_BUTTON_AREA = 60;

const styles = StyleSheet.create({
  container: { flexDirection: 'row', borderTopWidth: 1, alignItems: 'center' },
  tab: { flex: 1, height: TAB_BUTTON_AREA, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabLabel: { fontSize: 10, fontWeight: '600' },
  fabWrapper: { flex: 1, height: TAB_BUTTON_AREA, alignItems: 'center', justifyContent: 'center' },
  fab: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#7B5CF0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6, marginBottom: 8,
  },
});
