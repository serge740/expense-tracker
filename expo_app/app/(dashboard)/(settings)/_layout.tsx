import React from 'react';
import { Stack } from 'expo-router';

export default function SettingsLayout() {
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
    </Stack>
  );
}
