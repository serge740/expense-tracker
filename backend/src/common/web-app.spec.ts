import { isJoinPath, isWebAppPath, joinPageHeaders } from './web-app';

describe('isWebAppPath', () => {
  it('claims the web app\'s own pages', () => {
    for (const p of ['/', '/login', '/register', '/forgot-password', '/app', '/app/', '/app/wallets', '/app/debts/abc', '/it-support', '/it-support/login', '/it-support/data-export']) {
      expect(isWebAppPath(p)).toBe(true);
    }
  });

  it('leaves every API route and the socket alone', () => {
    for (const p of [
      '/client-auth/login', '/client-auth/passkey/login/options', '/budget', '/debts', '/devices', '/health', '/home/summary',
      '/notifications', '/receipts', '/reminders/tick', '/reports', '/scheduled', '/transactions', '/wallets',
      '/.well-known/assetlinks.json', '/.well-known/apple-app-site-association', '/uploads/x.png', '/socket.io/',
    ]) {
      expect(isWebAppPath(p)).toBe(false);
    }
  });

  it('claims the family invite page, with or without a token', () => {
    for (const p of ['/join', '/join/', '/join/abcDEF123_-abcDEF123_-abcd', '/join/abc/']) expect(isWebAppPath(p)).toBe(true);
  });

  it('does not claim look-alikes of the invite page, or the API route that joins a family', () => {
    for (const p of ['/joinx', '/join-us', '/family/join', '/family/invites/preview', '/api/join', '/join/a/b']) expect(isWebAppPath(p)).toBe(false);
  });

  it('does not mistake a path that merely starts with "app" for the web app', () => {
    expect(isWebAppPath('/apple')).toBe(false);
    expect(isWebAppPath('/application/x')).toBe(false);
  });
});

describe('the invite page', () => {
  it('knows its own addresses', () => {
    expect(isJoinPath('/join')).toBe(true);
    expect(isJoinPath('/join/tok')).toBe(true);
    expect(isJoinPath('/login')).toBe(false);
    expect(isJoinPath('/app/join')).toBe(false);
  });
  it('is never cached and never leaks its address in a Referer', () => {
    expect(joinPageHeaders()).toEqual({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  });
});

import { cacheHeaderFor } from './web-app';

describe('cacheHeaderFor', () => {
  it('never caches the service worker or the manifest, so updates reach people', () => {
    expect(cacheHeaderFor('D:\\site\\dist\\sw.js')).toBe('no-cache');
    expect(cacheHeaderFor('/site/dist/manifest.webmanifest')).toBe('no-cache');
    expect(cacheHeaderFor('/site/dist/version.json')).toBe('no-cache');
  });
  it('keeps the numbered build files for a year', () => {
    expect(cacheHeaderFor('/site/dist/assets/index-AbC123.js')).toContain('immutable');
    expect(cacheHeaderFor('D:\\site\\dist\\assets\\index.css')).toContain('immutable');
  });
  it('gives everything else (fonts, icons, sounds) an hour', () => {
    expect(cacheHeaderFor('/site/dist/fonts/Poppins_400Regular.ttf')).toBe('public, max-age=3600');
  });
});


import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join as joinPath, resolve as resolvePath } from 'path';
import { webAppDir } from './web-app';

describe('webAppDir (where the built web app is read from)', () => {
  let tmp: string;
  const site = (...parts: string[]) => {
    const dir = joinPath(tmp, ...parts);
    mkdirSync(dir, { recursive: true });
    writeFileSync(joinPath(dir, 'index.html'), '<html>');
    return dir;
  };
  beforeEach(() => { tmp = mkdtempSync(joinPath(tmpdir(), 'webdir-')); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  // A pretend backend: <tmp>/backend/dist/common is "this file", <tmp>/backend/web is the built copy.
  const here = () => { const d = joinPath(tmp, 'backend', 'dist', 'common'); mkdirSync(d, { recursive: true }); return d; };

  it('uses FRONTEND_DIST when it is set, over everything else', () => {
    site('backend', 'web');
    expect(webAppDir({ FRONTEND_DIST: joinPath(tmp, 'elsewhere') }, joinPath(tmp, 'backend'), here())).toBe(resolvePath(joinPath(tmp, 'elsewhere')));
  });

  it('finds backend/web next to the code, whichever folder the server was started from', () => {
    const web = site('backend', 'web');
    expect(webAppDir({}, tmp /* started from the repository root */, here())).toBe(joinPath(here(), '..', '..', 'web'));
    expect(webAppDir({}, joinPath(tmp, 'backend'), here())).toBe(joinPath(here(), '..', '..', 'web'));
    expect(resolvePath(joinPath(here(), '..', '..', 'web'))).toBe(resolvePath(web));
  });

  it('also finds backend/web in the start folder when the code is somewhere else', () => {
    const web = site('start', 'web');
    expect(webAppDir({}, joinPath(tmp, 'start'), joinPath(tmp, 'nowhere', 'a'))).toBe(web);
  });

  it('falls back to the frontend build next to the backend when there is no copy', () => {
    expect(webAppDir({}, joinPath(tmp, 'backend'), here())).toBe(resolvePath(tmp, 'frontend', 'dist'));
  });

  it('ignores an empty web folder (no index.html)', () => {
    mkdirSync(joinPath(tmp, 'backend', 'web'), { recursive: true });
    expect(webAppDir({}, joinPath(tmp, 'backend'), here())).toBe(resolvePath(tmp, 'frontend', 'dist'));
  });
});
