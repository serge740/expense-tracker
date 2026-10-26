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
