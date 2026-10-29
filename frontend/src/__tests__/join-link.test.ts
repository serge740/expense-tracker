import { describe, expect, test, vi } from 'vitest';
import { JOIN_PATH, captureJoinInvite, isPhoneBrowser, parseJoinAddress } from '@/utils/join-link';

const TOKEN = 'abcDEF123_-abcDEF123_-abcd';

const fakeWindow = (pathname: string, search = '') => {
  const replaceState = vi.fn();
  return { win: { location: { pathname, search }, history: { state: { idx: 3 }, replaceState } }, replaceState };
};

describe('reading the address of an invite link', () => {
  test('the path form, with or without a trailing slash', () => {
    expect(parseJoinAddress(`/join/${TOKEN}`, '')).toEqual({ token: TOKEN });
    expect(parseJoinAddress(`/join/${TOKEN}/`, '')).toEqual({ token: TOKEN });
  });
  test('the query forms', () => {
    expect(parseJoinAddress('/join', `?token=${TOKEN}`)).toEqual({ token: TOKEN });
    expect(parseJoinAddress('/join', '?code=k7m-2qx')).toEqual({ code: 'K7M2QX' });
  });
  test('nothing, or something that is not an invite', () => {
    expect(parseJoinAddress('/join', '')).toBeNull();
    expect(parseJoinAddress('/join/short', '')).toBeNull();
    expect(parseJoinAddress('/login', '?next=/join')).toBeNull();
  });
});

describe('taking the secret out of the address bar', () => {
  test('keeps the invite, and the address becomes plain /join', async () => {
    const { win, replaceState } = fakeWindow(`/join/${TOKEN}`);
    const save = vi.fn(async () => {});
    expect(await captureJoinInvite(win, save)).toEqual({ token: TOKEN });
    expect(save).toHaveBeenCalledWith({ token: TOKEN });
    expect(replaceState).toHaveBeenCalledWith({ idx: 3 }, '', JOIN_PATH);
  });
  test('removes a ?token= or ?code= too', async () => {
    const a = fakeWindow('/join', `?token=${TOKEN}`);
    await captureJoinInvite(a.win, async () => {});
    expect(a.replaceState).toHaveBeenCalledWith(expect.anything(), '', '/join');
    const b = fakeWindow('/join', '?code=K7M2QX');
    expect(await captureJoinInvite(b.win, async () => {})).toEqual({ code: 'K7M2QX' });
    expect(b.replaceState).toHaveBeenCalled();
  });
  test('the address is cleaned even when keeping it fails', async () => {
    const { win, replaceState } = fakeWindow(`/join/${TOKEN}`);
    await expect(captureJoinInvite(win, async () => { throw new Error('storage blocked'); })).rejects.toThrow('storage blocked');
    expect(replaceState).toHaveBeenCalledWith(expect.anything(), '', '/join');
  });
  test('with no invite in the address, nothing is saved and the address is left alone', async () => {
    const { win, replaceState } = fakeWindow('/join');
    const save = vi.fn(async () => {});
    expect(await captureJoinInvite(win, save)).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });
});

describe('isPhoneBrowser', () => {
  test('recognises phones and tablets, not desktops', () => {
    expect(isPhoneBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36')).toBe(true);
    expect(isPhoneBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15')).toBe(true);
    expect(isPhoneBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36')).toBe(false);
    expect(isPhoneBrowser('')).toBe(false);
  });
});
