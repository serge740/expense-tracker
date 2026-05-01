import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

const TAB_CONFIG: Record<string, { icon: IconName; label: string }> = {
  index:   { icon: 'home',                   label: 'Home'    },
  wallets: { icon: 'account-balance-wallet', label: 'Wallets' },
  reports: { icon: 'bar-chart',              label: 'Reports' },
  profile: { icon: 'settings',               label: 'Settings' },
};

const VISIBLE_TABS = ['index', 'wallets', 'reports', 'profile'];

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  const visibleRoutes = state.routes.filter(r => VISIBLE_TABS.includes(r.name));
  const leftRoutes  = visibleRoutes.slice(0, 2);
  const rightRoutes = visibleRoutes.slice(2);

  const renderTab = (route: typeof state.routes[0]) => {
    const isFocused = state.routes[state.index]?.name === route.name;
    const cfg = TAB_CONFIG[route.name];
    if (!cfg) return null;
    const color = isFocused ? theme.primary : theme.textMuted;

    return (
      <TouchableOpacity
        key={route.key}
        style={styles.tab}
        activeOpacity={0.7}
        onPress={() => { if (!isFocused) navigation.navigate(route.name); }}
      >
        <MaterialIcons name={cfg.icon} size={24} color={color} />
        <Text style={[styles.tabLabel, { color }]}>{cfg.label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.tabBorder,
          paddingBottom: insets.bottom,
          height: TAB_BUTTON_AREA + insets.bottom,
        },
      ]}
    >
      {leftRoutes.map(renderTab)}

      {/* FAB */}
      <View style={styles.fabWrapper}>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.primary }]}
          activeOpacity={0.85}
          onPress={() => router.push('/(dashboard)/add')}
        >
          <MaterialIcons name="add" size={30} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {rightRoutes.map(renderTab)}
    </View>
  );
}

const TAB_BUTTON_AREA = 60;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    height: TAB_BUTTON_AREA,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  fabWrapper: {
    flex: 1,
    height: TAB_BUTTON_AREA,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7B5CF0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 8,
  },
});
