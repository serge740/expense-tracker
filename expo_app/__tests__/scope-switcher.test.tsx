import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)', buttonBg: '#00627F', headerBg: '#00627F',
    text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9', border: 'rgba(0,98,127,0.12)', inputBg: '#F3F8FA', isDark: false,
  }),
}));
const scope = { value: {} as any };
jest.mock('@/context/scope-context', () => ({ useScope: () => scope.value }));

import { ScopePill } from '@/components/family/scope-switcher';
const { router } = require('expo-router') as { router: { push: jest.Mock } };

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const mount = (onHeader = false) => render(<SafeAreaProvider initialMetrics={metrics}><LanguageProvider><ScopePill onHeader={onHeader} /></LanguageProvider></SafeAreaProvider>);
const personalValue = (over: Record<string, unknown> = {}) => ({
  ready: true, scope: 'personal', isFamily: false, family: null, role: null, memberCount: 0, switchTo: jest.fn(async () => {}), ...over,
});
const familyBits = { family: { id: 'f1', name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' }, role: 'MEMBER', memberCount: 4 };

beforeEach(() => { jest.clearAllMocks(); });

describe('the pill', () => {
  test('says Personal when you are in your own space', async () => {
    scope.value = personalValue();
    await mount();
    expect(screen.getByText('Personal')).toBeTruthy();
  });
  test('shows the family name when you are standing in it', async () => {
    scope.value = personalValue({ isFamily: true, scope: 'family', ...familyBits });
    await mount();
    expect(screen.getByText('Mwiza Family')).toBeTruthy();
  });
  test('shows the family name only when in the family, even if you have one', async () => {
    scope.value = personalValue({ ...familyBits });
    await mount();
    expect(screen.queryByText('Mwiza Family')).toBeNull();
    expect(screen.getByText('Personal')).toBeTruthy();
  });
});

describe('the sheet for someone with no family', () => {
  test('offers Create and Join, and each goes to its screen', async () => {
    scope.value = personalValue();
    await mount();
    await fireEvent.press(screen.getByTestId('scope-pill'));
    expect(screen.getByText('Where are you?')).toBeTruthy();
    expect(screen.getByTestId('scope-personal')).toBeTruthy();
    expect(screen.queryByTestId('scope-family')).toBeNull();
    await fireEvent.press(screen.getByTestId('scope-create'));
    expect(router.push).toHaveBeenCalledWith('/(dashboard)/family-create');
    await fireEvent.press(screen.getByTestId('scope-pill'));
    await fireEvent.press(screen.getByTestId('scope-join'));
    expect(router.push).toHaveBeenCalledWith('/(dashboard)/family-join');
  });
});

describe('the sheet for someone in a family', () => {
  test('lists Personal, the family with its size and their role, and the family settings', async () => {
    scope.value = personalValue({ ...familyBits });
    await mount();
    await fireEvent.press(screen.getByTestId('scope-pill'));
    expect(screen.getByText('Mwiza Family')).toBeTruthy();
    expect(screen.getByText('4 members · you are member')).toBeTruthy();
    expect(screen.queryByTestId('scope-create')).toBeNull();
    expect(screen.queryByTestId('scope-join')).toBeNull();
    await fireEvent.press(screen.getByTestId('scope-manage'));
    expect(router.push).toHaveBeenCalledWith('/(dashboard)/family');
  });
  test('choosing the family switches to it', async () => {
    scope.value = personalValue({ ...familyBits });
    await mount();
    await fireEvent.press(screen.getByTestId('scope-pill'));
    await fireEvent.press(screen.getByTestId('scope-family'));
    expect(scope.value.switchTo).toHaveBeenCalledWith('family');
  });
  test('choosing Personal switches back', async () => {
    scope.value = personalValue({ isFamily: true, scope: 'family', ...familyBits });
    await mount();
    await fireEvent.press(screen.getByTestId('scope-pill'));
    await fireEvent.press(screen.getByTestId('scope-personal'));
    expect(scope.value.switchTo).toHaveBeenCalledWith('personal');
  });
  test('a family of one reads "1 member"', async () => {
    scope.value = personalValue({ ...familyBits, memberCount: 1 });
    await mount();
    await fireEvent.press(screen.getByTestId('scope-pill'));
    expect(screen.getByText('1 member · you are member')).toBeTruthy();
  });
});
