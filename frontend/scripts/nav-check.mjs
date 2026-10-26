// Clicks through the app in a real browser against the DEVELOPMENT server (React runs everything twice there, which
// is where navigation once broke) and checks that every move changes BOTH the address and the screen.
//   node scripts/nav-check.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const PORT = 5300 + Math.floor(Math.random() * 100);
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore', env: { ...process.env, BACKEND_URL: 'http://localhost:1' } });
const origin = `http://localhost:${PORT}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* starting */ } await sleep(250); }

const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const profile = mkdtempSync(join(tmpdir(), 'nav-'));
const dbg = 9900 + Math.floor(Math.random() * 90);
const browser = spawn(exe, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ } if (!wsUrl) await sleep(250); }
const ws = new WebSocket(wsUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const waiting = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expression => { const r = (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result.value; };

const path = () => ev('location.pathname + location.search');
const text = () => ev('document.body.innerText');
/** Waits (up to 6 s) for the screen to contain some text. */
async function seen(needle) { for (let i = 0; i < 40; i++) { if ((await text()).includes(needle)) return true; await sleep(150); } return false; }
// A button is found by its text or label, or by its icon ("icon:close" for the X, "icon:arrow-back" for the back arrow).
const click = label => ev(`(() => {
  const want = ${JSON.stringify(label)}.toLowerCase();
  const nodes = [...document.querySelectorAll('[role=button],[role=tab],button,a')].filter(n => n.getBoundingClientRect().width > 0);
  const icon = want.startsWith('icon:') ? want.slice(5).replace(/-/g, '_') : null;
  const hit = icon
    ? nodes.filter(n => n.querySelector('.material-icons') && n.querySelector('.material-icons').textContent.trim() === icon && n.textContent.trim() === icon).shift()
    : nodes.filter(n => (n.getAttribute('aria-label') || n.textContent || '').trim().toLowerCase() === want).pop();
  if (!hit) return false; hit.click(); return true;
})()`);
const go = async (label, expectPath, expectText) => {
  const clicked = await click(label);
  const shown = clicked && await seen(expectText);
  const p = await path();
  check(`${label}: address ${expectPath} and the "${expectText}" screen`, clicked && shown && p.startsWith(expectPath), clicked ? `at ${p}` : 'button not found');
};

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${origin}/app?mock=1` });
  check('Home opens', await seen('Include loans'), await path());

  // the four tabs, there and back
  await go('Wallets', '/app/wallets', 'My wallets');
  await go('Debts', '/app/debts', 'Debts & loans');
  await go('Settings', '/app/profile', 'Profile');
  await go('Home', '/app', 'Include loans');

  // the + button opens a screen, and its close button returns to the one before
  await go('Add', '/app/add', 'New transaction');
  check('close returns to Home', (await click('icon:close')) && await seen('Include loans'), await path());

  // the browser's own Back button, and Forward
  await go('Wallets', '/app/wallets', 'My wallets');
  await ev('history.back()');
  check('browser Back returns to Home (address and screen)', await seen('Include loans') && (await path()) === '/app', await path());
  await ev('history.forward()');
  check('browser Forward returns to Wallets (address and screen)', await seen('My wallets') && (await path()) === '/app/wallets', await path());

  // a settings page, reached from Profile, with its back button
  await go('Settings', '/app/profile', 'Profile');
  await ev(`(() => { const n = [...document.querySelectorAll('[role=button]')].find(b => b.textContent.includes('Channels, alerts and quiet hours')); n && n.click(); return !!n; })()`);
  check('a Profile row opens Notification settings', await seen('Push status') === false && await seen('This device') && (await path()) === '/app/notification-settings', await path());
  check('its back arrow returns to Profile', (await click('icon:arrow-back')) && await seen('Verify your phone') && (await path()) === '/app/profile', await path());

  // deep links: loading an address directly shows that screen
  for (const [url, needle] of [['/app/budget', 'Spending Limit'], ['/app/history', 'History'], ['/app/reports', 'Monthly Overview'], ['/app/debts?openId=d1', 'Borrowed from']]) {
    await send('Page.navigate', { url: `${origin}${url}` });
    check(`deep link ${url}`, await seen(needle), await path());
  }

  // signed out: the app address sends you to sign in
  await send('Page.navigate', { url: `${origin}/login` });
  await ev(`sessionStorage.clear(); localStorage.clear(); true`);
  await send('Page.navigate', { url: `${origin}/app/wallets` });
  await sleep(1200);
  check('without signing in, /app/wallets goes to /login', (await path()) === '/login', await path());
} catch (e) {
  check('the check ran to the end', false, String(e.message ?? e));
} finally {
  ws.close(); browser.kill(); server.kill();
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* still in use */ }
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
