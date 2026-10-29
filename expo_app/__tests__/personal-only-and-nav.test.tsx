import React from 'react';
import { Text as RNText } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import { PreferencesProvider } from '@/context/preferences-context';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockRouter = { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), replace: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({
  get router() { return mockRouter; },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@/services/debt.service', () => ({ getDebts: jest.fn(async () => []), getDebtsOverview: jest.fn(async () => ({})) }));
jest.mock('@/services/scheduled.service', () => ({ getScheduled: jest.fn(async () => []), getWaitingScheduled: jest.fn(async () => []) }));
jest.mock('@/services/client-auth.service', () => ({ getMe: jest.fn(async () => ({ firstName: 'Aline', email: 'a@x.test', phone: '+250788000000' })), logout: jest.fn() }));
jest.mock('@/services/transaction.service', () => ({ getTransactions: jest.fn(async () => ({ total: 12 })) }));
jest.mock('@/services/wallet.service', () => ({ getWalletSummary: jest.fn(async () => ({ walletCount: 3, totalBalance: 0 })) }));
jest.mock('@/services/google-signin', () => ({ GoogleSignin: { signOut: jest.fn() } }));
jest.mock('@/context/notification-context', () => ({ useNotifications: () => ({ unread: 0, refresh: jest.fn() }) }));
jest.mock('@/components/fade-in-view', () => ({ FadeInView: ({ children }: any) => children }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', surface: '#FFFFFF', primary: '#5B3FD0', primaryBg: 'rgba(91,63,208,0.1)', buttonBg: '#5B3FD0', headerBg: '#5B3FD0',
    text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9', border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));
const mockScope: { value: any } = { value: {} };
jest.mock('@/context/scope-context', () => ({ useScope: () => mockScope.value }));

import { withPersonalOnly } from '@/components/family/personal-only-screen';
import { CustomTabBar } from '@/components/custom-tab-bar';
import ProfileScreen from '@/app/(dashboard)/profile';
import DebtsScreen from '@/app/(dashboard)/debts';
import ScheduledScreen from '@/app/(dashboard)/scheduled';
import DebtLedgerScreen from '@/app/(dashboard)/debt-ledger';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}><LanguageProvider><PreferencesProvider>{ui}</PreferencesProvider></LanguageProvider></SafeAreaProvider>);
const family = { id: 'fam-12345678', name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' };
const MAY: Record<string, (a: string) => boolean> = { OWNER: () => true, ADMIN: () => true, MEMBER: a => a === 'tx.add', VIEWER: () => false };
const inFamily = (role: string) => ({ ready: true, isFamily: true, scope: 'family', family, role, switchTo: jest.fn(async () => {}), can: MAY[role] });
const personal = () => ({ ready: true, isFamily: false, scope: 'personal', family: null, role: null, switchTo: jest.fn(async () => {}), can: () => true });

beforeEach(() => { jest.clearAllMocks(); mockScope.value = personal(); });
afterEach(cleanup);

describe('withPersonalOnly', () => {
  const Inner = () => <RNText testID="inner">the real screen</RNText>;
  const Gated = withPersonalOnly(Inner);

  test('in Personal it is the same screen', async () => {
    await wrap(<Gated />);
    expect(screen.getByTestId('inner')).toBeTruthy();
    expect(screen.queryByTestId('personal-only')).toBeNull();
  });
  test('in a family the screen is not built, and the notice offers the way back', async () => {
    mockScope.value = inFamily('OWNER');
    await wrap(<Gated />);
    expect(screen.queryByTestId('inner')).toBeNull();
    expect(screen.getByTestId('personal-only')).toBeTruthy();
    expect(screen.getByText('Personal only')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('personal-only-switch'));
    expect(mockScope.value.switchTo).toHaveBeenCalledWith('personal');
  });
});

describe('Loans and debts, Scheduled and the Loan ledger inside a family', () => {
  const screens: Array<[string, React.ComponentType]> = [['Loans and debts', DebtsScreen], ['Scheduled', ScheduledScreen], ['Debt ledger', DebtLedgerScreen]];
  test.each(screens)('%s shows the notice and asks for nothing', async (_name, Screen) => {
    mockScope.value = inFamily('MEMBER');
    await wrap(<Screen />);
    expect(screen.getByTestId('personal-only')).toBeTruthy();
    const debtSvc = require('@/services/debt.service') as { getDebts: jest.Mock };
    const schedSvc = require('@/services/scheduled.service') as { getScheduled: jest.Mock };
    expect(debtSvc.getDebts).not.toHaveBeenCalled();
    expect(schedSvc.getScheduled).not.toHaveBeenCalled();
  });
});

describe('the tab bar', () => {
  const state = { index: 0, routes: ['index', 'wallets', 'debts', 'profile'].map(name => ({ key: name, name })) } as any;
  const bar = () => wrap(<CustomTabBar state={state} navigation={{ navigate: jest.fn() } as any} descriptors={{} as any} insets={metrics.insets} />);

  test('Personal: the big + is there and opens Add', async () => {
    await bar();
    await fireEvent.press(screen.getByTestId('tab-add'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(dashboard)/add');
  });
  test.each(['OWNER', 'ADMIN', 'MEMBER'])('a family %s has it', async role => {
    mockScope.value = inFamily(role);
    await bar();
    expect(screen.getByTestId('tab-add')).toBeTruthy();
  });
  test('a family Viewer does not', async () => {
    mockScope.value = inFamily('VIEWER');
    await bar();
    expect(screen.queryByTestId('tab-add')).toBeNull();
    expect(screen.getByText('Home')).toBeTruthy();          // the tabs themselves are still there
  });
});

describe('Settings → Family row', () => {
  test('with no family it invites to create or join', async () => {
    await wrap(<ProfileScreen />);
    expect(await screen.findByText('Create a family or join with a code')).toBeTruthy();
    await fireEvent.press(screen.getByText('Family'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(dashboard)/family');
  });
  test('with a family it names it and the role', async () => {
    mockScope.value = { ...inFamily('ADMIN'), isFamily: false };
    await wrap(<ProfileScreen />);
    expect(await screen.findByText('Mwiza Family · you are admin')).toBeTruthy();
  });
});
