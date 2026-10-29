import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/services/family.service', () => ({ getMyFamily: jest.fn() }));
jest.mock('@/components/custom-tab-bar', () => ({ CustomTabBar: () => null }));
jest.mock('@/hooks/use-settings-back', () => ({ resetSettingsOnBlur: {} }));
jest.mock('@/hooks/use-app-theme', () => ({ useAppTheme: () => ({ background: '#fff', primary: '#00627F' }) }));

const mockPush = jest.fn();
// A stand-in for the tab navigator that counts how many times the screens were built.
const built = { count: 0 };
jest.mock('expo-router', () => {
  const React = require('react');
  const Tabs: any = ({ children }: { children: React.ReactNode }) => { React.useEffect(() => { built.count++; }, []); return React.createElement(React.Fragment, null, children); };
  Tabs.Screen = () => null;
  return { Tabs, router: { push: (...a: unknown[]) => mockPush(...a) } };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScopeProvider, useScope, type ScopeValue } from '@/context/scope-context';
import { ScopedTabs } from '@/components/family/scoped-tabs';
import { FAMILY_HEADER, clearScopeOnSessionLoss, handleScopeError } from '@/utils/family-scope-link';
import { savePendingInvite } from '@/utils/pending-invite';

const family = require('@/services/family.service') as { getMyFamily: jest.Mock<() => Promise<any>> };
const mine = { family: { id: 'fam-12345678', name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' }, role: 'OWNER', memberCount: 2, limits: {} };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

let latest: ScopeValue;
const Probe = () => { latest = useScope(); return null; };
const mount = () => render(<SafeAreaProvider initialMetrics={metrics}><LanguageProvider><ScopeProvider><Probe /><ScopedTabs /></ScopeProvider></LanguageProvider></SafeAreaProvider>);

beforeEach(async () => { jest.clearAllMocks(); built.count = 0; await AsyncStorage.clear(); family.getMyFamily.mockResolvedValue(mine); });
afterEach(async () => { await cleanup(); clearScopeOnSessionLoss(); });

describe('the screens are rebuilt when the scope changes', () => {
  test('nothing is built until the server has said which family the person is in', async () => {
    let release: (v: any) => void = () => {};
    family.getMyFamily.mockReturnValue(new Promise(r => { release = r; }));
    await mount();
    expect(screen.getByTestId('scope-loading')).toBeTruthy();
    expect(built.count).toBe(0);
    await act(async () => { release(mine); });
    await waitFor(() => expect(screen.queryByTestId('scope-loading')).toBeNull());
    expect(built.count).toBe(1);
  });

  test('every switch builds the screens again, in each direction', async () => {
    await mount();
    await waitFor(() => expect(built.count).toBe(1));
    await act(async () => { await latest.switchTo('family'); });
    await waitFor(() => expect(built.count).toBe(2));
    await act(async () => { await latest.switchTo('personal'); });
    await waitFor(() => expect(built.count).toBe(3));
  });

  test('refreshing without a change does not rebuild them', async () => {
    await mount();
    await waitFor(() => expect(built.count).toBe(1));
    await act(async () => { await latest.refresh(); });
    expect(built.count).toBe(1);
  });
});

describe('losing the family while using it', () => {
  test('builds the screens again in Personal and tells the person once', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem('family:scope', 'fam-12345678');
    await mount();
    await waitFor(() => expect(built.count).toBe(1));
    expect(latest.scope).toBe('family');
    family.getMyFamily.mockResolvedValue(null);
    const error = { response: { status: 403, data: { code: 'NOT_A_MEMBER' } }, config: { headers: { [FAMILY_HEADER]: 'fam-12345678' } } };
    await act(async () => { handleScopeError(error); });
    await waitFor(() => expect(latest.scope).toBe('personal'));
    await waitFor(() => expect(built.count).toBe(2));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe('Family access ended');
    expect(String(alert.mock.calls[0][1])).toContain('Mwiza Family');
    expect(latest.notice).toBeNull();
  });
});

describe('an invite waiting from before sign-in', () => {
  test('opens the Join screen once, as soon as the dashboard is ready', async () => {
    await savePendingInvite({ code: 'K7M2QX' });
    await mount();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(dashboard)/family-join'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    await act(async () => { await latest.switchTo('family'); });
    expect(mockPush).toHaveBeenCalledTimes(1);          // a scope switch does not ask again
  });
  test('nothing waiting: nothing opens', async () => {
    await mount();
    await waitFor(() => expect(built.count).toBe(1));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
