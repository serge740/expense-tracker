import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, TextInput } from 'react-native';
import 'react-native-reanimated';
import React, { useEffect } from 'react';
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

import { useColorScheme } from '@/hooks/use-color-scheme';
import { getToken } from '@/services/client-auth.service';

export const unstable_settings = {
  anchor: 'index',
};

// Global font fallback — catches any Text not using @/components/text
if (!Text.defaultProps) (Text as any).defaultProps = {};
(Text as any).defaultProps.style = { fontFamily: 'Poppins_400Regular' };
if (!TextInput.defaultProps) (TextInput as any).defaultProps = {};
(TextInput as any).defaultProps.style = { fontFamily: 'Poppins_400Regular' };

export default function RootLayout() {
  const colorScheme = useColorScheme();

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
    if (!fontsLoaded) return;
    (async () => {
      const token = await getToken();
      if (token) router.replace('/(dashboard)');
    })();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(dashboard)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
