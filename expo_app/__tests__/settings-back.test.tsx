import React from 'react';
import { test, expect, afterEach } from '@jest/globals';
import { Text, Pressable } from 'react-native';
import { router, Stack, Tabs } from 'expo-router';
import { renderRouter, fireEvent, act, cleanup } from 'expo-router/testing-library';
import { useSettingsBack, resetSettingsOnBlur } from '@/hooks/use-settings-back';

// Mirrors app/(dashboard): Tabs with Home + Profile, and the hidden (settings) stack.
function DashboardLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="(settings)" options={{ href: null }} listeners={resetSettingsOnBlur as any} />
    </Tabs>
  );
}

function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

const page = (name: string, links: Record<string, string> = {}) => function Page() {
  const back = useSettingsBack();
  return (
    <>
      <Text>{name}</Text>
      <Pressable onPress={back}><Text>back</Text></Pressable>
      {Object.entries(links).map(([label, href]) => (
        <Pressable key={label} onPress={() => router.push(href as any)}><Text>{label}</Text></Pressable>
      ))}
    </>
  );
};

function Profile() {
  return (
    <>
      <Text>PROFILE</Text>
      <Pressable onPress={() => router.push('/(dashboard)/(settings)/notification-settings')}><Text>open-notif</Text></Pressable>
      <Pressable onPress={() => router.push('/(dashboard)/(settings)/verify')}><Text>open-verify</Text></Pressable>
      <Pressable onPress={() => router.push('/(dashboard)/(settings)/edit-profile')}><Text>edit-profile</Text></Pressable>
    </>
  );
}

const routes = {
  '_layout': () => <Stack screenOptions={{ headerShown: false }} />,
  '(dashboard)/_layout': DashboardLayout,
  '(dashboard)/index': () => <Text>HOME</Text>,
  '(dashboard)/profile': Profile,
  '(dashboard)/(settings)/_layout': { default: SettingsLayout, unstable_settings: { initialRouteName: 'index' } },
  '(dashboard)/(settings)/index': () => <Text>SETTINGS-HUB</Text>,
  '(dashboard)/(settings)/notification-settings': page('NOTIF-SETTINGS', { 'open-inbox': '/(dashboard)/(settings)/notifications' }),
  '(dashboard)/(settings)/notifications': page('INBOX'),
  '(dashboard)/(settings)/verify': page('VERIFY', { 'open-edit': '/(dashboard)/(settings)/edit-profile' }),
  '(dashboard)/(settings)/edit-profile': page('EDIT-PROFILE'),
};

type R = Awaited<ReturnType<typeof renderRouter>>;
let r: R;
const press = async (label: string) => { await act(async () => { fireEvent.press(r.getAllByText(label).at(-1)!); }); };
/** The focused screen is the last one rendered that isn't hidden. */
const visible = (name: string) => expect(r.getByText(name)).toBeVisible();
afterEach(() => cleanup());
const start = async () => { r = await renderRouter(routes, { initialUrl: '/profile' }); };

test('back from a settings page opened from Profile returns to Profile', async () => {
  await start();
  await press('open-notif');
  visible('NOTIF-SETTINGS');
  await press('back');
  visible('PROFILE');
});

test('back from a nested settings page returns to the page that opened it', async () => {
  await start();
  await press('open-notif');
  await press('open-inbox');
  visible('INBOX');
  await press('back');
  visible('NOTIF-SETTINGS');
  await press('back');
  visible('PROFILE');
});

test('a second visit does not keep pages from the first visit underneath', async () => {
  await start();
  await press('open-verify');
  await press('open-edit');
  await press('back');
  visible('VERIFY');
  await press('back');
  visible('PROFILE');
  await press('open-notif');
  await press('back');
  visible('PROFILE');
});

test('back from Edit profile (opened from the Profile tab) returns to Profile', async () => {
  await start();
  await press('edit-profile');
  visible('EDIT-PROFILE');
  await press('back');
  visible('PROFILE');
  // and again on a second visit
  await press('edit-profile');
  await press('back');
  visible('PROFILE');
});
