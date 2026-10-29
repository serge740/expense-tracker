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
/** Clicks a button whose label contains some text (the scope pill's label includes the current space's name). */
const clickContaining = sub => ev(`(() => {
  const want = ${JSON.stringify(sub)}.toLowerCase();
  const hit = [...document.querySelectorAll('[role=button],button,a')].filter(n => n.getBoundingClientRect().width > 0)
    .find(n => (n.getAttribute('aria-label') || n.textContent || '').toLowerCase().includes(want));
  if (!hit) return false; hit.click(); return true;
})()`);
/** Clicks a tab-bar tab by its label. */
const clickTab = label => ev(`(() => {
  const hit = [...document.querySelectorAll('[role=tab]')].find(n => n.getAttribute('aria-label') === ${JSON.stringify(label)});
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
  await go('Loans', '/app/debts', 'Loans & debts');
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

  // ── Family: the switcher, the screens that follow the space, the hub, and the invite page ──
  const TOKEN = 'abcDEF123_-abcDEF123_-abcd';
  await send('Page.navigate', { url: `${origin}/app?mock=1&role=OWNER` });
  check('Home in Personal shows the scope pill and the loan switch', await seen('Include loans') && await seen('Personal'), await path());
  check('the pill opens the "Where are you?" sheet', (await clickContaining('where are you')) && await seen('Mwiza Family'), await path());
  check('choosing the family rebuilds Home as the family (balance card, no loan switch)', (await clickContaining('mwiza family')) && await seen('FAMILY BALANCE') && !(await text()).includes('Include loans'), await path());
  check('the family has its own bar: Home, Wallets, Add and Settings (no Loans, no big button)', await ev(`(() => {
    const bar = document.querySelector('[data-testid="family-tab-bar"]') || document.querySelector('[role=tablist]');
    const labels = [...document.querySelectorAll('[role=tab]')].map(n => n.getAttribute('aria-label'));
    return !!bar && labels.join(',') === 'Home,Wallets,Add,Settings' && !!document.querySelector('[data-testid="tab-add"]');
  })()`), await path());
  check('Settings in the family bar opens the family settings (the hub)', (await clickTab('Settings')) && await seen('MEMBERS') && (await path()) === '/app/family', await path());
  check('the hub has a way to the app settings', (await clickContaining('app settings')) && (await path()) === '/app/profile', await path());
  const s1 = await clickTab('Home'), s2 = await seen('FAMILY BALANCE'), s3 = await clickContaining('where are you'), s4 = await seen('Only you'), s5 = await clickContaining('personal'), s6 = await seen('Include loans');
  const s7 = await ev(`!![...document.querySelectorAll('[role=tab]')].find(n => n.getAttribute('aria-label') === 'Loans')`);
  check('the pill brings Personal back with its own bar (Loans is there again)', s1 && s2 && s3 && s4 && s5 && s6 && s7, `${await path()} steps ${[s1, s2, s3, s4, s5, s6, s7].map(Number).join('')}`);
  await go('Home', '/app', 'Include loans');
  check('Settings has a Family row that opens the hub', (await go('Settings', '/app/profile', 'Profile'), await clickContaining('family')) && await seen('MEMBERS') && (await path()) === '/app/family', await path());
  check('the hub lists the members and the invite button (Owner)', await seen('Grace Uwase') && await seen('Invite someone'), await path());
  check('Invite someone opens the invite sheet', (await click('Invite someone')) && await seen('Choose what they can do'), await path());
  check('a Member cannot invite: the button is replaced by a note', await (async () => {
    await send('Page.navigate', { url: `${origin}/app/family?mock=1&role=MEMBER` });
    return (await seen('Only the owner and admins can invite people.')) && !(await text()).includes('Invite someone');
  })(), await path());
  check('a Viewer has no big + on the tab bar', await (async () => {
    await send('Page.navigate', { url: `${origin}/app?mock=1&role=VIEWER` });
    await seen('Personal');
    await clickContaining('where are you'); await seen('Mwiza Family');
    await clickContaining('mwiza family'); await seen('FAMILY BALANCE');
    return !(await ev(`!!document.querySelector('[aria-label="Add"]')`));
  })(), await path());
  await send('Page.navigate', { url: `${origin}/app?mock=1&role=OWNER` });

  // someone with no family: the create and join screens, and an invite code
  await send('Page.navigate', { url: `${origin}/app/family-create?mock=1&nofamily=1` });
  check('Create a family opens', await seen('Create family') && await seen('FAMILY NAME'), await path());
  check('an empty name is refused in words', (await click('Create family')) && await seen('Enter a family name.'), await path());
  await send('Page.navigate', { url: `${origin}/app/family-join?nofamily=1` });
  check('Join a family opens', await seen('Join a family') && await seen('INVITE CODE OR LINK'), await path());

  // an invite link, signed in: the secret leaves the address bar and the invite is shown
  await send('Page.navigate', { url: `${origin}/join/${TOKEN}` });
  check('the invite link lands on the Join screen', await seen('Join Mwiza Family') && (await path()).startsWith('/app/family-join'), await path());
  check('the secret is not in the address bar', !(await path()).includes(TOKEN) && !(await ev('JSON.stringify(history.state)')).includes(TOKEN), await path());
  check('the preview says who invited and the privacy notice', await seen('Invited by Aline Uwase') && await seen('They can never see your personal money'), await path());
  check('Join takes the person into the family', (await click('Join Mwiza Family')) && await seen('FAMILY BALANCE'), await path());

  // signed out: the invite link asks for sign-in first, and still keeps the secret out of the address bar
  await send('Page.navigate', { url: `${origin}/login` });
  await ev(`sessionStorage.clear(); localStorage.clear(); true`);
  await send('Page.navigate', { url: `${origin}/join/${TOKEN}` });
  check('signed out, the invite page asks to sign in or create an account', await seen("You're invited") && await seen('Sign in') && await seen('Create an account'), await path());
  check('and the address is plain /join', (await path()) === '/join', await path());
  check('Sign in goes to the sign-in screen', (await click('Sign in')) && (await path()) === '/login', await path());

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
