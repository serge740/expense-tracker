import { Tabs, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { BackHandler, Alert } from 'react-native';
import { CustomTabBar } from '@/components/custom-tab-bar';

// Segment names that correspond to the four visible tabs
const MAIN_TAB_SEGMENTS = new Set(['index', 'wallets', 'reports', 'profile']);

export default function DashboardLayout() {
  const segments = useSegments() as string[];

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      // If we're anywhere inside the (settings) group let that layout handle it
      if (segments.includes('(settings)')) return false;

      // Determine if the user is on one of the four main tabs (or the root tab)
      const last = segments[segments.length - 1];
      const isOnMainTab =
        last === '(dashboard)' || MAIN_TAB_SEGMENTS.has(last);

      if (isOnMainTab) {
        Alert.alert(
          'Exit App',
          'Are you sure you want to exit?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
          ],
          { cancelable: true },
        );
        return true; // consume — dialog handles the rest
      }

      return false; // allow default (pops add/scan/history screens naturally)
    });

    return () => handler.remove();
  }, [segments]);

  return (
    <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index"   />
      <Tabs.Screen name="wallets" />
      <Tabs.Screen name="reports" />
      <Tabs.Screen name="profile" />
      {/* Hidden from tab bar — navigated to programmatically */}
      <Tabs.Screen name="add"        options={{ href: null }} />
      <Tabs.Screen name="scan"       options={{ href: null }} />
      <Tabs.Screen name="history"    options={{ href: null }} />
      <Tabs.Screen name="expense"       options={{ href: null }} />
      <Tabs.Screen name="wallet-detail" options={{ href: null }} />
      <Tabs.Screen name="(settings)" options={{ href: null }} />
    </Tabs>
  );
}
