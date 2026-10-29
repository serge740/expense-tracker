import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import BudgetScreen from '@/app/(dashboard)/budget';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));
jest.mock('@/components/fade-in-view', () => ({ FadeInView: ({ children }: any) => children }));
jest.mock('@/components/budget-modal', () => ({ BudgetModal: () => null }));
jest.mock('@/services/budget.service', () => ({ getCurrentBudget: jest.fn() }));
jest.mock('@/services/reports.service', () => ({ getReportSummary: jest.fn(), getCategoryBreakdown: jest.fn(), getMonthlyReport: jest.fn(), getAiAdvice: jest.fn() }));
jest.mock('@/services/transaction.service', () => ({ CATEGORY_ICON: {}, CATEGORY_LABEL: {} }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', surface: '#FFFFFF', primary: '#5B3FD0', primaryBg: 'rgba(91,63,208,0.1)', buttonBg: '#5B3FD0', headerBg: '#5B3FD0',
    text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9', border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', isDark: false,
  }),
}));
const mockScope: { value: any } = { value: {} };
jest.mock('@/context/scope-context', () => ({ useScope: () => mockScope.value }));

type Fn = jest.Mock<(...a: any[]) => Promise<any>>;
const budgetSvc = require('@/services/budget.service') as { getCurrentBudget: Fn };
const reports = require('@/services/reports.service') as Record<'getReportSummary' | 'getCategoryBreakdown' | 'getMonthlyReport', Fn>;
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const mount = () => render(<SafeAreaProvider initialMetrics={metrics}><LanguageProvider><BudgetScreen /></LanguageProvider></SafeAreaProvider>);

const family = { id: 'fam-12345678', name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' };
const inFamily = (role: string) => ({ ready: true, isFamily: true, scope: 'family', family, role, switchTo: jest.fn(), can: (a: string) => a === 'budget.set' ? role === 'OWNER' || role === 'ADMIN' : true });
const personal = () => ({ ready: true, isFamily: false, scope: 'personal', family: null, role: null, switchTo: jest.fn(), can: () => true });
const withLimit = (limit: number) => ({ limit, spent: 400, remaining: Math.max(limit - 400, 0), percentage: limit ? Math.round(40000 / limit) : 0, month: new Date().getMonth() + 1, year: new Date().getFullYear() });

beforeEach(() => {
  jest.clearAllMocks();
  reports.getReportSummary.mockResolvedValue({ totalIncome: 0, totalExpense: 400, net: -400 });
  reports.getCategoryBreakdown.mockResolvedValue([]);
  reports.getMonthlyReport.mockResolvedValue([]);
  budgetSvc.getCurrentBudget.mockResolvedValue(withLimit(1000));
  mockScope.value = personal();
});
afterEach(cleanup);

describe('Budget', () => {
  test('in Personal: Set Limit and Edit are there', async () => {
    await mount();
    expect(await screen.findByTestId('budget-set-limit')).toBeTruthy();
    expect(await screen.findByTestId('budget-edit')).toBeTruthy();
  });
  test.each(['OWNER', 'ADMIN'])('in a family a %s can set and edit the limit', async role => {
    mockScope.value = inFamily(role);
    await mount();
    expect(await screen.findByTestId('budget-set-limit')).toBeTruthy();
    expect(await screen.findByTestId('budget-edit')).toBeTruthy();
  });
  test.each(['MEMBER', 'VIEWER'])('in a family a %s sees the budget but cannot set or edit it', async role => {
    mockScope.value = inFamily(role);
    await mount();
    await screen.findByText(/Monthly limit/);
    expect(screen.queryByTestId('budget-set-limit')).toBeNull();
    expect(screen.queryByTestId('budget-edit')).toBeNull();
  });
  test.each(['MEMBER', 'VIEWER'])('with no budget yet, a %s is told who can set one', async role => {
    budgetSvc.getCurrentBudget.mockResolvedValue(withLimit(0));
    mockScope.value = inFamily(role);
    await mount();
    expect(await screen.findByTestId('budget-read-only')).toHaveTextContent('Only the owner and admins can change the family budget.');
    expect(screen.queryByTestId('budget-set')).toBeNull();
  });
  test('with no budget yet, an Admin can set one', async () => {
    budgetSvc.getCurrentBudget.mockResolvedValue(withLimit(0));
    mockScope.value = inFamily('ADMIN');
    await mount();
    expect(await screen.findByTestId('budget-set')).toBeTruthy();
    expect(screen.queryByTestId('budget-read-only')).toBeNull();
  });
});
