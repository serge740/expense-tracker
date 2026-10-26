// End-to-end check that the web app and the API share one address. Needs frontend/dist (npm run build there).
// Run: npx ts-node scripts/web-app-check.ts   (no database)
import 'reflect-metadata';
import { Controller, Get, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { readdirSync } from 'fs';
import { join } from 'path';
import { serveWebApp, webAppDir } from '../src/common/web-app';

@Controller('debts')
class FakeDebts {
  @Get() list() { return { api: true }; }
  @Post() make() { return { made: true }; }
}
@Controller('client-auth')
class FakeAuth {
  @Post('login') login() { return { token: 'x' }; }
}
@Module({ controllers: [FakeDebts, FakeAuth] })
class FakeApp {}

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

async function main() {
  const app = await NestFactory.create(FakeApp, { logger: false });
  const served = serveWebApp(app);
  check('the built web app was found', served, webAppDir());
  await app.listen(0);
  const base = `http://localhost:${(app.getHttpServer().address() as any).port}`;
  const get = async (p: string, init?: RequestInit) => { const r = await fetch(base + p, init); return { r, text: await r.text() }; };

  for (const p of ['/', '/login', '/register', '/forgot-password', '/app', '/app/wallets', '/app/debts/abc']) {
    const { r, text } = await get(p);
    check(`${p} serves the web app`, r.status === 200 && text.includes('<div id="root">'), `(${r.status})`);
  }
  const api = await get('/debts');
  check('GET /debts is still the API', api.text.includes('"api":true'));
  const post = await get('/client-auth/login', { method: 'POST' });
  check('POST /client-auth/login is still the API', post.text.includes('"token"'));
  const postLogin = await get('/login', { method: 'POST' });
  check('POST /login is not swallowed by the web app', postLogin.r.status === 404);

  const assets = readdirSync(join(webAppDir(), 'assets'));
  const js = assets.find(f => f.endsWith('.js'))!;
  const asset = await get(`/assets/${js}`);
  check('built JavaScript is served as a file', asset.r.status === 200 && (asset.r.headers.get('content-type') ?? '').includes('javascript'));
  const font = await get('/fonts/Poppins_400Regular.ttf');
  check('fonts are served', font.r.status === 200);
  const icons = await get('/fonts/material-icons.woff2');
  check('the icon font is served', icons.r.status === 200);

  const sw = await get('/sw.js');
  check('the service worker is served and never cached', sw.r.status === 200 && sw.r.headers.get('cache-control') === 'no-cache', sw.r.headers.get('cache-control') ?? '');
  check('and it may control the whole site', sw.r.headers.get('service-worker-allowed') === '/');
  check('the service worker is JavaScript', (sw.r.headers.get('content-type') ?? '').includes('javascript'));
  const mf = await get('/manifest.webmanifest');
  check('the manifest is served and never cached', mf.r.status === 200 && mf.r.headers.get('cache-control') === 'no-cache');
  check('the manifest is valid JSON with the app name', JSON.parse(mf.text).name === 'Rabbit Tracker');
  for (const icon of ['icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'apple-touch-icon.png', 'badge-96.png']) {
    const r = await get('/icons/' + icon);
    check('icon ' + icon + ' is served as an image', r.r.status === 200 && (r.r.headers.get('content-type') ?? '').startsWith('image/png'));
  }
  check('built files are cached for a year', (asset.r.headers.get('cache-control') ?? '').includes('immutable'));
  const apiPush = await get('/push-notifications/public-key');
  check('the push API is not swallowed by the web app', apiPush.r.status === 404 && !apiPush.text.includes('<div id="root">'));

  await app.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
