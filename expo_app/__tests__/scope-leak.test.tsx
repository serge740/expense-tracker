import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import { PreferencesProvider } from '@/context/preferences-context';

/**
 * The promise of the family feature, tested end to end on the app's side: whichever space you switch to, nothing from the
 * other one stays on screen. The services here answer like the real server does: what they return depends on whether the
 * family header is on at that moment (read from the same place the real network layer reads it).
 */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@/components/fade-in-view', () => ({ FadeInView: ({ children }: any) => children }));
jest.mock('@/components/budget-modal', () => ({ BudgetModal: () => null }));
jest.mock('@/components/wallet-form-modal', () => ({ WalletFormModal: () => null }));
jest.mock('@/components/wallet/wallet-hero-card', () => ({ WalletHeroCard: ({ wallet }: any) => require('react').createElement(require('react-native').Text, null, wallet.name) }));
jest.mock('@/components/wallet/flow-chart', () => ({ FlowChart: () => null }));
jest.mock('@/components/debt/ledger-cards', () => ({ LedgerCards: () => null }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)', buttonBg: '#00627F', headerBg: '#00627F',
    text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9', border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));

// "The server": answers with the family's data only when the family header is on.
jest.mock('@/services/client-auth.service', () => ({ getMe: jest.fn(async () => ({ firstName: 'Aline' })) }));
jest.mock('@/services/budget.service', () => ({ getCurrentBudget: jest.fn(async () => ({ limit: 0, spent: 0, remaining: 0, percentage: 0, month: 10, year: 2030 })) }));
jest.mock('@/services/home.service', () => ({
  getHomeSummary: jest.fn(async () => ({
    month: 10, year: 2030, includeLoans: true, totals: { income: 0, expense: 0, net: 0 }, loans: { out: 0, in: 0, borrowed: 0 },
    owe: {}, owed: {}, scheduled: { waiting: 0, next: null }, attention: [], attentionTotal: 0, netWorth: [],
  })),
}));
jest.mock('@/services/transaction.service', () => {
  const { getActiveFamilyId } = require('@/utils/family-scope-link');
  const row = (id: string, title: string) => ({ id, type: 'EXPENSE', category: 'food', title, subCategory: null, description: null, amount: -100, date: '2030-10-20T10:00:00Z', walletId: 'w', receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null });
  const rows = () => (getActiveFamilyId() ? [row('f1', 'FAMILY-GROCERIES')] : [row('p1', 'PERSONAL-COFFEE')]);
  return {
    CATEGORY_ICON: {}, formatSubtitle: () => 'x', deleteTransaction: jest.fn(),
    getRecentTransactions: jest.fn(async () => rows()),
    getTransactionHistory: jest.fn(async () => [{ date: 'TODAY', items: rows() }]),
  };
});
jest.mock('@/services/wallet.service', () => {
  const { getActiveFamilyId } = require('@/utils/family-scope-link');
  const w = (id: string, name: string) => ({ id, name, bank: 'B', currency: 'RWF', balance: 100, color: 'teal', walletType: 'CASH', last4: null, archived: false, isDefault: true });
  return {
    getWallets: jest.fn(async () => (getActiveFamilyId() ? [w('fw', 'FAMILY-HOUSEHOLD')] : [w('pw', 'PERSONAL-MOMO')])),
    getDailyFlow: jest.fn(async () => ({ base: 'RWF', days: [], totalIn: 0, totalOut: 0 })), getActivity: jest.fn(async () => []),
    getBalanceHistory: jest.fn(async () => ({ currency: 'RWF', points: [] })), deleteWallet: jest.fn(), updateWallet: jest.fn(),
    getWalletOverview: jest.fn(async () => ({ base: 'RWF', total: 100, yesterday: 100, change: 0, walletCount: 1, byCurrency: { RWF: 100 }, unconverted: [], rates: {}, ratesUpdatedAt: null })),
  };
});
jest.mock('@/services/family.service', () => ({
  getMyFamily: jest.fn(async () => ({ family: { id: 'fam-12345678', name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' }, role: 'OWNER', memberCount: 2, limits: { maxMembers: 12, maxPendingInvites: 20, inviteDays: 7 } })),
  getMembers: jest.fn(async () => []),
}));

import HomeScreen from '@/app/(dashboard)/index';
import WalletsScreen from '@/app/(dashboard)/wallets';
import HistoryScreen from '@/app/(dashboard)/history';
import { ScopeProvider, useScope, type ScopeValue } from '@/context/scope-context';
import { clearScopeOnSessionLoss } from '@/utils/family-scope-link';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
let scope: ScopeValue;
const Probe = () => { scope = useScope(); return null; };

/** What the dashboard does: the screen is rebuilt whenever the scope changes. */
const Rebuilt = ({ children }: { children: React.ReactNode }) => {
  const s = useScope();
  return s.ready ? <React.Fragment key={`${s.scopeKey}:${s.epoch}`}>{children}</React.Fragment> : null;
};
const mount = (screenEl: React.ReactElement) => render(
  <SafeAreaProvider initialMetrics={metrics}>
    <LanguageProvider><PreferencesProvider><ScopeProvider><Probe /><Rebuilt>{screenEl}</Rebuilt></ScopeProvider></PreferencesProvider></LanguageProvider>
  </SafeAreaProvider>,
);

beforeEach(async () => {
  jest.clearAllMocks();
  const mod = require('@react-native-async-storage/async-storage');
  await (mod.default ?? mod).clear();
});
afterEach(async () => { await cleanup(); clearScopeOnSessionLoss(); });

const cases: Array<[string, React.ReactElement, string, string]> = [
  ['Home', <HomeScreen key="h" />, 'PERSONAL-COFFEE', 'FAMILY-GROCERIES'],
  ['History', <HistoryScreen key="y" />, 'PERSONAL-COFFEE', 'FAMILY-GROCERIES'],
  ['Wallets', <WalletsScreen key="w" />, 'PERSONAL-MOMO', 'FAMILY-HOUSEHOLD'],
];

describe.each(cases)('%s never shows one space inside the other', (_name, element, personalText, familyText) => {
  test('Personal → Family → Personal', async () => {
    await mount(element);
    expect(await screen.findByText(personalText)).toBeTruthy();
    expect(screen.queryByText(familyText)).toBeNull();

    await act(async () => { await scope.switchTo('family'); });
    // Right after the switch the personal row is gone; the family one arrives with its own request.
    expect(screen.queryByText(personalText)).toBeNull();
    expect(await screen.findByText(familyText)).toBeTruthy();
    expect(screen.queryByText(personalText)).toBeNull();

    await act(async () => { await scope.switchTo('personal'); });
    expect(screen.queryByText(familyText)).toBeNull();
    expect(await screen.findByText(personalText)).toBeTruthy();
    expect(screen.queryByText(familyText)).toBeNull();
  });

  test('starting inside the family (saved choice), then back to Personal', async () => {
    const mod = require('@react-native-async-storage/async-storage');
    await (mod.default ?? mod).setItem('family:scope', 'fam-12345678');
    await mount(element);
    expect(await screen.findByText(familyText)).toBeTruthy();
    expect(screen.queryByText(personalText)).toBeNull();
    await act(async () => { await scope.switchTo('personal'); });
    expect(screen.queryByText(familyText)).toBeNull();
    await waitFor(() => expect(screen.queryByText(personalText)).toBeTruthy());
  });
});
