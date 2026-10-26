import { isWebAppPath } from './web-app';

describe('isWebAppPath', () => {
  it('claims the web app\'s own pages', () => {
    for (const p of ['/', '/login', '/register', '/forgot-password', '/app', '/app/', '/app/wallets', '/app/debts/abc']) {
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

  it('does not mistake a path that merely starts with "app" for the web app', () => {
    expect(isWebAppPath('/apple')).toBe(false);
    expect(isWebAppPath('/application/x')).toBe(false);
  });
});

import { cacheHeaderFor } from './web-app';

describe('cacheHeaderFor', () => {
  it('never caches the service worker or the manifest, so updates reach people', () => {
    expect(cacheHeaderFor('D:\\site\\dist\\sw.js')).toBe('no-cache');
    expect(cacheHeaderFor('/site/dist/manifest.webmanifest')).toBe('no-cache');
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
  const originalCwd = process.cwd();
  const originalEnv = process.env.FRONTEND_DIST;
  let tmp: string;

  beforeEach(() => {
    delete process.env.FRONTEND_DIST;
    tmp = mkdtempSync(joinPath(tmpdir(), 'webdir-'));
    process.chdir(tmp);
  });
  afterEach(() => {
    process.chdir(originalCwd);
    if (originalEnv === undefined) delete process.env.FRONTEND_DIST; else process.env.FRONTEND_DIST = originalEnv;
    rmSync(tmp, { recursive: true, force: true });
  });

  it('uses FRONTEND_DIST when it is set, over everything else', () => {
    mkdirSync(joinPath(tmp, 'web'));
    writeFileSync(joinPath(tmp, 'web', 'index.html'), '<html>');
    process.env.FRONTEND_DIST = joinPath(tmp, 'elsewhere');
    expect(webAppDir()).toBe(resolvePath(joinPath(tmp, 'elsewhere')));
  });

  it('then uses the copy inside the backend (backend/web) when it has been built', () => {
    mkdirSync(joinPath(tmp, 'web'));
    writeFileSync(joinPath(tmp, 'web', 'index.html'), '<html>');
    expect(webAppDir()).toBe(joinPath(process.cwd(), 'web'));
  });

  it('falls back to the frontend folder\'s own build when there is no copy', () => {
    expect(webAppDir()).toBe(resolvePath(process.cwd(), '..', 'frontend', 'dist'));
  });

  it('ignores an empty web folder (no index.html)', () => {
    mkdirSync(joinPath(tmp, 'web'));
    expect(webAppDir()).toBe(resolvePath(process.cwd(), '..', 'frontend', 'dist'));
  });
});
