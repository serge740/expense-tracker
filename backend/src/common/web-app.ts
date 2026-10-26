import { existsSync } from 'fs';
import { join, resolve } from 'path';
import * as express from 'express';
import type { INestApplication } from '@nestjs/common';

/**
 * Caching rules for the built files. The service worker and the manifest must never be cached, or an update
 * would not reach people; the numbered files in /assets never change, so they can be kept for a year.
 */
export function cacheHeaderFor(path: string): string {
  const parts = path.split(/[\\/]/);
  const name = parts[parts.length - 1];
  if (name === 'sw.js' || name === 'manifest.webmanifest') return 'no-cache';
  if (parts.includes('assets')) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

function setStaticHeaders(res: express.Response, path: string) {
  res.setHeader('Cache-Control', cacheHeaderFor(path));
  // The worker lives at the root, so it may control the whole site.
  if (path.split(/[\\/]/).pop() === 'sw.js') res.setHeader('Service-Worker-Allowed', '/');
}

/** Addresses that belong to the web app. Everything else (the API, /uploads, the socket) is left alone. */
const WEB_PAGES = new Set(['/', '/login', '/register', '/forgot-password']);

export function isWebAppPath(path: string): boolean {
  return WEB_PAGES.has(path) || /^\/app(\/|$)/.test(path);
}

/** Where the built web app is: FRONTEND_DIST, or ../frontend/dist next to the backend folder. */
export function webAppDir(): string {
  return resolve(process.env.FRONTEND_DIST || join(process.cwd(), '..', 'frontend', 'dist'));
}

/**
 * Serves the built web app from the same address as the API, so the browser sees one site
 * (which is what passkeys need). Does nothing when the web app has not been built.
 */
export function serveWebApp(app: INestApplication): boolean {
  const dir = webAppDir();
  const index = join(dir, 'index.html');
  if (!existsSync(index)) return false;

  const server = app as unknown as { use: (...args: unknown[]) => void };
  // Real files first (assets, fonts, images, sounds, icons); no automatic index so "/" goes through the page rule below.
  server.use(express.static(dir, { index: false, setHeaders: setStaticHeaders }));
  // The web app's own pages all get index.html, and the app's router takes it from there.
  server.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !isWebAppPath(req.path)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
  return true;
}
