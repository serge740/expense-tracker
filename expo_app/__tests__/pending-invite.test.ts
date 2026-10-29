import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PENDING_MAX_AGE_MS, clearPendingInvite, loadPendingInvite, savePendingInvite } from '@/utils/pending-invite';

const TOKEN = 'abcDEF123_-abcDEF123_-abcd';
beforeEach(async () => { await AsyncStorage.clear(); });

describe('an invite waiting for sign-in', () => {
  test('a code is kept and read back, then cleared', async () => {
    await savePendingInvite({ code: 'K7M2QX' });
    expect(await loadPendingInvite()).toEqual({ code: 'K7M2QX' });
    await clearPendingInvite();
    expect(await loadPendingInvite()).toBeNull();
  });
  test('a token is kept the same way', async () => {
    await savePendingInvite({ token: TOKEN });
    expect(await loadPendingInvite()).toEqual({ token: TOKEN });
  });
  test('it is forgotten after seven days', async () => {
    const t0 = 1_700_000_000_000;
    await savePendingInvite({ code: 'K7M2QX' }, t0);
    expect(await loadPendingInvite(t0 + PENDING_MAX_AGE_MS - 1000)).toEqual({ code: 'K7M2QX' });
    expect(await loadPendingInvite(t0 + PENDING_MAX_AGE_MS + 1000)).toBeNull();
    expect(await AsyncStorage.getItem('family:pending-invite')).toBeNull();
  });
  test('an empty invite is not saved', async () => {
    await savePendingInvite({});
    expect(await AsyncStorage.getItem('family:pending-invite')).toBeNull();
  });
  test('damaged or tampered storage is ignored, and only a real token or code is ever returned', async () => {
    await AsyncStorage.setItem('family:pending-invite', '{not json');
    expect(await loadPendingInvite()).toBeNull();
    await AsyncStorage.setItem('family:pending-invite', JSON.stringify({ input: { code: 'NOT A CODE' }, savedAt: Date.now() }));
    expect(await loadPendingInvite()).toBeNull();
    await AsyncStorage.setItem('family:pending-invite', JSON.stringify({ input: { token: 'x'.repeat(10) }, savedAt: Date.now() }));
    expect(await loadPendingInvite()).toBeNull();
  });
});
