import React from 'react';
import { Stack } from 'expo-router';
import { useGroupedNavigation } from '@/hooks/use-grouped-navigation';

export default function SettingsLayout() {
  // Back button on any non-index settings screen returns to the settings index
  // instead of the previous screen in the stack.
  useGroupedNavigation('(settings)', '/(dashboard)/(settings)');

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 300,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="index"         />
      <Stack.Screen name="profile"       />
      <Stack.Screen name="devices"       />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="appearance"    />
      <Stack.Screen name="currency"      />
      <Stack.Screen name="help"          />
      <Stack.Screen name="privacy"       />
      <Stack.Screen name="about"         />
    </Stack>
  );
}
