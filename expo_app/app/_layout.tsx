import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, TextInput } from 'react-native';
import 'react-native-reanimated';
import React, { useEffect, useState, useCallback } from 'react';
import {
  useFonts,
  Poppins_100Thin,
  Poppins_200ExtraLight,
  Poppins_300Light,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
  Poppins_900Black,
} from '@expo-google-fonts/poppins';
import * as SplashScreen from 'expo-splash-screen';

import { ThemePreferenceProvider, useThemePreference } from '@/context/theme-context';
import { CurrencyProvider } from '@/context/currency-context';
import { getToken } from '@/services/client-auth.service';
import { AppSplash } from '@/components/app-splash';

SplashScreen.preventAutoHideAsync();

// Global font fallback
if (!Text.defaultProps) (Text as any).defaultProps = {};
(Text as any).defaultProps.style = { fontFamily: 'Poppins_400Regular' };
if (!TextInput.defaultProps) (TextInput as any).defaultProps = {};
(TextInput as any).defaultProps.style = { fontFamily: 'Poppins_400Regular' };

export const unstable_settings = { anchor: 'index' };

function RootLayoutInner() {
  const { resolvedScheme } = useThemePreference();
  const [splashDone, setSplashDone] = useState(false);

  const [fontsLoaded] = useFonts({
    Poppins_100Thin,
    Poppins_200ExtraLight,
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
    Poppins_900Black,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    if (!fontsLoaded || !splashDone) return;
    (async () => {
      const token = await getToken();
      if (token) router.replace('/(dashboard)');
    })();
  }, [fontsLoaded, splashDone]);

  const handleSplashDone = useCallback(() => setSplashDone(true), []);

  return (
    <ThemeProvider value={resolvedScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade_from_bottom',
          animationDuration: 320,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="index"       options={{ animation: 'fade' }} />
        <Stack.Screen name="(dashboard)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)"      options={{ animation: 'fade' }} />
        <Stack.Screen name="(auth)"      options={{ animation: 'fade' }} />
        <Stack.Screen name="modal"       options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack>

      {fontsLoaded && !splashDone && (
        <AppSplash onComplete={handleSplashDone} />
      )}

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemePreferenceProvider>
      <CurrencyProvider>
        <RootLayoutInner />
      </CurrencyProvider>
    </ThemePreferenceProvider>
  );
}
