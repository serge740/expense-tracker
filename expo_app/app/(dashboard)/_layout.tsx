import { Tabs } from 'expo-router';
import React from 'react';
import { CustomTabBar } from '@/components/custom-tab-bar';

export default function DashboardLayout() {
  return (
    <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index"   />
      <Tabs.Screen name="wallets" />
      <Tabs.Screen name="reports" />
      <Tabs.Screen name="profile" />
      {/* Hidden from tab bar — navigated to programmatically */}
      <Tabs.Screen name="add"     options={{ href: null }} />
      <Tabs.Screen name="scan"    options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="(settings)" options={{ href: null }} />
    </Tabs>
  );
}
