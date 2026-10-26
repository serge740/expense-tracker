import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.BACKEND_URL || 'http://localhost:3001';
  const proxy = Object.fromEntries(
    API_PATHS.map(p => [`/${p}`, { target, changeOrigin: false, ws: p === 'socket.io' }]),
  );

  return {
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
  };
});
