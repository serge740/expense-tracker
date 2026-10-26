import { beforeEach, describe, expect, test, vi } from 'vitest';

const { googleCodeClient, googleAuthClient } = vi.hoisted(() => ({ googleCodeClient: vi.fn(async () => ({})), googleAuthClient: vi.fn(async () => ({})) }));
vi.mock('@/services/client-auth.service', () => ({ googleCodeClient, googleAuthClient }));

import { GOOGLE_CLIENT_ID, signInWith, startGoogleOneTap } from './social-auth';

type Config = { client_id: string; scope: string; callback: (r: { code?: string; error?: string }) => void; error_callback: (e: { type?: string; message?: string }) => void };

/** A pretend Google script: the next sign-in is answered by `answer`. */
function fakeGoogle(answer: (c: Config) => void) {
  (globalThis as any).window = {
    google: { accounts: { oauth2: { initCodeClient: (c: Config) => ({ requestCode: () => answer(c) }) } } },
  };
}

beforeEach(() => { googleCodeClient.mockClear(); googleAuthClient.mockClear(); });

describe('Google sign-in on the web', () => {
  test('sends the code Google returns to the server, using the shared web client', async () => {
    let seen: Config | undefined;
    fakeGoogle(c => { seen = c; c.callback({ code: 'one-time-code' }); });
    expect(await signInWith('google', '+250788000000')).toBe(true);
    expect(seen?.client_id).toBe(GOOGLE_CLIENT_ID);
    expect(seen?.scope).toBe('openid email profile');
    expect(googleCodeClient).toHaveBeenCalledWith('one-time-code', '+250788000000');
  });

  test('closing the popup is a cancel, not an error', async () => {
    fakeGoogle(c => c.error_callback({ type: 'popup_closed' }));
    expect(await signInWith('google')).toBe(false);
    expect(googleCodeClient).not.toHaveBeenCalled();
  });

  test('refusing access is a cancel too', async () => {
    fakeGoogle(c => c.callback({ error: 'access_denied' }));
    expect(await signInWith('google')).toBe(false);
  });

  test('a blocked popup says what to do', async () => {
    fakeGoogle(c => c.error_callback({ type: 'popup_failed_to_open' }));
    await expect(signInWith('google')).rejects.toThrow(/pop-ups/i);
  });

  test('other providers are not offered', async () => {
    await expect(signInWith('apple')).rejects.toThrow(/Google/);
  });
});

describe('Google One Tap (the "Continue as ..." card)', () => {
  type Init = { client_id: string; auto_select?: boolean; callback: (r: { credential?: string }) => void };
  function fakeOneTap() {
    const calls = { init: undefined as Init | undefined, prompts: 0, cancels: 0 };
    (globalThis as any).window = { google: { accounts: { oauth2: {}, id: {
      initialize: (c: Init) => { calls.init = c; }, prompt: () => { calls.prompts++; }, cancel: () => { calls.cancels++; },
    } } } };
    return calls;
  }
  const settle = () => new Promise(r => setTimeout(r, 0));

  test('shows the card, and a chosen account signs in with its ID token', async () => {
    const calls = fakeOneTap();
    const done = vi.fn();
    startGoogleOneTap(done);
    await settle();
    expect(calls.prompts).toBe(1);
    expect(calls.init?.client_id).toBe(GOOGLE_CLIENT_ID);
    expect(calls.init?.auto_select).toBe(false);
    calls.init!.callback({ credential: 'id-token' });
    await settle();
    expect(googleAuthClient).toHaveBeenCalledWith('id-token');
    expect(done).toHaveBeenCalledTimes(1);
  });

  test('a failed sign-in leaves the screen alone', async () => {
    const calls = fakeOneTap();
    const done = vi.fn();
    googleAuthClient.mockRejectedValueOnce(new Error('nope'));
    startGoogleOneTap(done);
    await settle();
    calls.init!.callback({ credential: 'bad' });
    await settle();
    expect(done).not.toHaveBeenCalled();
  });

  test('leaving the screen closes the card and ignores a late answer', async () => {
    const calls = fakeOneTap();
    const done = vi.fn();
    const stop = startGoogleOneTap(done);
    await settle();
    stop();
    expect(calls.cancels).toBe(1);
    calls.init!.callback({ credential: 'late' });
    await settle();
    expect(done).not.toHaveBeenCalled();
  });
});
