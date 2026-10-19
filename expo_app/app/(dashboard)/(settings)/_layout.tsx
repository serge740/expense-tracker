import React, { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { Stack, useSegments } from 'expo-router';
import { settingsBack } from '@/hooks/use-settings-back';

// Keep `index` at the root so every settings page sits on a known base.
export const unstable_settings = { initialRouteName: 'index' };

export default function SettingsLayout() {
  const segments = useSegments() as string[];
  // Navigation object of the settings page currently on screen.
  const focusedNav = useRef<Parameters<typeof settingsBack>[0] | null>(null);

  // Android hardware back: same behaviour as the on-screen back button
  // (previous settings page if there is one, otherwise the Profile tab).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!segments.includes('(settings)') || !focusedNav.current) return false;
      settingsBack(focusedNav.current);
      return true;
    });
    return () => sub.remove();
  }, [segments]);

  return (
    <Stack
      screenListeners={({ navigation }) => ({
        focus: () => { focusedNav.current = navigation; },
      })}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 300,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="index"         />
      <Stack.Screen name="edit-profile"  />
      <Stack.Screen name="devices"       />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="appearance"    />
      <Stack.Screen name="currency"      />
      <Stack.Screen name="help"          />
      <Stack.Screen name="privacy"       />
      <Stack.Screen name="about"         />
      <Stack.Screen name="verify"        />
      <Stack.Screen name="security"      />
      <Stack.Screen name="schedule"      />
      <Stack.Screen name="date-time"     />
      <Stack.Screen name="notification-settings" />
    </Stack>
  );
}
