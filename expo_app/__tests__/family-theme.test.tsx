import React from 'react';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, render } from '@testing-library/react-native';

const mode = { scheme: 'light', isFamily: false };
jest.mock('@/context/theme-context', () => ({ useThemePreference: () => ({ resolvedScheme: mode.scheme }) }));
jest.mock('@/context/scope-context', () => ({ useScope: () => ({ isFamily: mode.isFamily }) }));

import { useAppTheme, type AppTheme } from '@/hooks/use-app-theme';
import { FAMILY_PURPLE, FAMILY_PURPLE_DEEP, FAMILY_PURPLE_SOFT } from '@/constants/family-theme';

let theme: AppTheme;
const Probe = () => { theme = useAppTheme(); return null; };
const read = async (scheme: 'light' | 'dark', isFamily: boolean) => { mode.scheme = scheme; mode.isFamily = isFamily; await render(<Probe />); return theme; };
afterEach(cleanup);

describe('the family look', () => {
  test('Personal keeps the brand teal in light and dark', async () => {
    expect((await read('light', false)).headerBg).toBe('#00627F');
    await cleanup();
    expect((await read('dark', false)).headerBg).toBe('#061217');
  });
  test('inside a family the accent and the header turn purple (light)', async () => {
    const t = await read('light', true);
    expect([t.primary, t.headerBg, t.buttonBg]).toEqual([FAMILY_PURPLE, FAMILY_PURPLE, FAMILY_PURPLE]);
    expect(t.background).toBe('#EEF7FA');            // only the accent changes, not the page
    expect(t.isDark).toBe(false);
  });
  test('and in dark mode', async () => {
    const t = await read('dark', true);
    expect([t.primary, t.headerBg, t.buttonBg]).toEqual([FAMILY_PURPLE_SOFT, FAMILY_PURPLE_DEEP, FAMILY_PURPLE]);
    expect(t.isDark).toBe(true);
  });
  test('money colours never change with the scope', async () => {
    const a = await read('light', false); await cleanup();
    const b = await read('light', true);
    expect([b.income, b.expense]).toEqual([a.income, a.expense]);
  });
});
