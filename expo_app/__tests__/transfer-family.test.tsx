import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import TransferScreen from '@/app/(dashboard)/transfer';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockRouter = { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({
  get router() { return mockRouter; },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@/services/wallet.service', () => ({ getWallets: jest.fn(), getTransferQuote: jest.fn(), transferBetweenWallets: jest.fn() }));
jest.mock('@/components/wallet-form-modal', () => ({ WalletFormModal: () => null }));
jest.mock('@/components/wallet/converter', () => ({ Converter: () => null }));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', surface: '#FFFFFF', primary: '#5B3FD0', primaryBg: 'rgba(91,63,208,0.1)', buttonBg: '#5B3FD0', headerBg: '#5B3FD0',
    text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9', border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', isDark: false,
  }),
}));
const mockScope: { value: any } = { value: {} };
jest.mock('@/context/scope-context', () => ({ useScope: () => mockScope.value }));

const walletSvc = require('@/services/wallet.service') as { getWallets: jest.Mock<(...a: any[]) => Promise<any>> };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const mount = () => render(<SafeAreaProvider initialMetrics={metrics}><LanguageProvider><TransferScreen /></LanguageProvider></SafeAreaProvider>);
const family = { id: 'fam-12345678', name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' };
const inFamily = (role: string) => ({ ready: true, isFamily: true, scope: 'family', family, role, switchTo: jest.fn(), can: (a: string) => (a === 'tx.add' ? role !== 'VIEWER' : true) });

beforeEach(() => { jest.clearAllMocks(); walletSvc.getWallets.mockResolvedValue([]); mockScope.value = { ready: true, isFamily: false, scope: 'personal', can: () => true }; });
afterEach(cleanup);

describe('Transfer inside a family', () => {
  test('a Viewer sees why they cannot, instead of the form, and can close it', async () => {
    mockScope.value = inFamily('VIEWER');
    await mount();
    expect(await screen.findByTestId('viewer-cannot-add')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('viewer-close'));
    expect(mockRouter.back).toHaveBeenCalled();
  });
  test.each(['MEMBER', 'ADMIN', 'OWNER'])('a %s gets the transfer screen', async role => {
    mockScope.value = inFamily(role);
    await mount();
    await screen.findByText('Transfer');
    expect(screen.queryByTestId('viewer-cannot-add')).toBeNull();
    expect(walletSvc.getWallets).toHaveBeenCalled();
  });
  test('in Personal the screen is as before', async () => {
    await mount();
    await screen.findByText('Transfer');
    expect(screen.queryByTestId('viewer-cannot-add')).toBeNull();
  });
});
