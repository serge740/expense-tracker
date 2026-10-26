import { describe, expect, test } from 'vitest';
import { activeTab } from './custom-tab-bar';

describe('activeTab', () => {
  test('the dashboard home is the first tab', () => {
    expect(activeTab('/app')).toBe('index');
    expect(activeTab('/app/')).toBe('index');
  });
  test('each tab is recognised by its address', () => {
    expect(activeTab('/app/wallets')).toBe('wallets');
    expect(activeTab('/app/debts')).toBe('debts');
    expect(activeTab('/app/profile')).toBe('profile');
  });
  test('hidden screens light up no tab', () => {
    for (const p of ['/app/add', '/app/history', '/app/scan', '/app/notifications', '/app/wallet-detail', '/app/debt-ledger']) {
      expect(activeTab(p)).toBeNull();
    }
  });
});
