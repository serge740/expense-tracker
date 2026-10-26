import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * In development the browser only ever talks to this dev server. Anything that belongs to the backend is
 * forwarded to it, so the web app and the API share one address. That is what lets passkeys work (they are
 * tied to the address) and removes CORS and cross-site cookie problems. In production the backend serves
 * this app itself, which gives the same single address.
 */
const API_PATHS = [
  'client-auth', 'budget', 'debts', 'devices', 'health', 'home', 'notifications', 'receipts',
  'reminders', 'reports', 'push-notifications', 'scheduled', 'transactions', 'wallets', 'uploads', '.well-known', 'socket.io',
];

/**
 * Every build gets a stamp. It is baked into the app (so the app knows which build it is) and written to /version.json
 * (so a running app can ask the server which build is newest). Different stamps mean an update is waiting.
 */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const build = { version: pkg.version, buildId: new Date().toISOString() };
const versionFile: Plugin = {
  name: 'version-file',
  configureServer(server) {
    server.middlewares.use('/version.json', (_req, res) => { res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(build)); });
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(build) });
  },
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.BACKEND_URL || 'http://localhost:3001';
  const proxy = Object.fromEntries(
    API_PATHS.map(p => [`/${p}`, { target, changeOrigin: false, ws: p === 'socket.io' }]),
  );

  return {
    plugins: [react(), versionFile],
    define: { __APP_VERSION__: JSON.stringify(build.version), __BUILD_ID__: JSON.stringify(build.buildId) },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
  };
});
