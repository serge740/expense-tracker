import { describe, expect, test } from 'vitest';
import { stripAppPrefix, toWebPath } from './paths';

describe('toWebPath', () => {
  test('auth screens lose their group', () => {
    expect(toWebPath('/(auth)/login')).toBe('/login');
    expect(toWebPath('/(auth)/forgot-password')).toBe('/forgot-password');
  });
  test('the dashboard lives under /app', () => {
    expect(toWebPath('/(dashboard)')).toBe('/app');
    expect(toWebPath('/(dashboard)/wallets')).toBe('/app/wallets');
  });
  test('settings screens are under /app too, without the group', () => {
    expect(toWebPath('/(dashboard)/(settings)/notifications')).toBe('/app/notifications');
  });
  test('the welcome page keeps /', () => {
    expect(toWebPath('/')).toBe('/');
  });
  test('params become a query string and keep any that were already there', () => {
    expect(toWebPath({ pathname: '/(dashboard)/debts', params: { openId: 'd1' } })).toBe('/app/debts?openId=d1');
    expect(toWebPath({ pathname: '/(dashboard)/history?view=debt', params: { page: 2 } })).toBe('/app/history?view=debt&page=2');
  });
  test('undefined and null params are skipped', () => {
    expect(toWebPath({ pathname: '/(dashboard)/add', params: { a: undefined, b: null, c: 'x' } })).toBe('/app/add?c=x');
  });
  test('a trailing slash is dropped', () => {
    expect(toWebPath('/(dashboard)/wallets/')).toBe('/app/wallets');
  });
});

describe('stripAppPrefix', () => {
  test('maps web paths back to the Expo-style path', () => {
    expect(stripAppPrefix('/app')).toBe('/');
    expect(stripAppPrefix('/app/wallets')).toBe('/wallets');
    expect(stripAppPrefix('/login')).toBe('/login');
  });
});
