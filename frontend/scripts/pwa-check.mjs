// Checks the installable-app and notification setup in a real headless browser (no libraries, no push server needed):
// the service worker registers, the manifest is valid and the app is installable, the notification settings page
// walks through its states, a browser subscription is made, and a push delivered to the worker shows a notification.
//   npm run build:mock   (once)   then   node scripts/pwa-check.mjs [outDir-for-screenshots]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const shotsDir = process.argv[2] ?? join(root, 'shots-pwa');
mkdirSync(shotsDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

// Serve the screenshot build (it contains the sample-data mode; a normal build does not).
const siteDir = join(root, 'dist-mock');
if (!existsSync(join(siteDir, 'index.html'))) { console.error('Build it first: VITE_MOCK=1 npx vite build --outDir dist-mock'); process.exit(2); }
const PORT = 4190 + Math.floor(Math.random() * 50);
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', 'dist-mock', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
const origin = `http://localhost:${PORT}`;
for (let i = 0; i < 40; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* starting */ } await sleep(250); }

const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(existsSync);
const profile = mkdtempSync(join(tmpdir(), 'pwa-'));
const dbg = 9500 + Math.floor(Math.random() * 100);
const browser = spawn(exe, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });

async function wsUrl(path, pick) {
  for (let i = 0; i < 60; i++) {
    try { const j = await (await fetch(`http://127.0.0.1:${dbg}${path}`)).json(); const u = pick(j); if (u) return u; } catch { /* starting */ }
    await sleep(250);
  }
  throw new Error('browser did not start');
}
function client(url) {
  const ws = new WebSocket(url);
  let id = 0; const waiting = new Map(); const events = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); } else if (m.method) events.push(m); };
  const ready = new Promise(r => { ws.onopen = r; });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed'); return r.result.value; };
  return { ready, send, evaluate, events, close: () => ws.close() };
}

try {
  const page = client(await wsUrl('/json', j => j.find(t => t.type === 'page')?.webSocketDebuggerUrl));
  const root_ = client(await wsUrl('/json/version', j => j.webSocketDebuggerUrl));
  await Promise.all([page.ready, root_.ready]);
  await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('ServiceWorker.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: false });

  await page.send('Page.navigate', { url: `${origin}/app/notification-settings?mock=1` });
  await sleep(2500);

  // 1. service worker
  const scriptUrl = await page.evaluate(`navigator.serviceWorker.ready.then(r => r.active && r.active.scriptURL)`);
  check('the service worker registers and becomes active', scriptUrl === `${origin}/sw.js`, scriptUrl ?? '');
  const scope = await page.evaluate(`navigator.serviceWorker.ready.then(r => r.scope)`);
  check('it controls the whole site', scope === `${origin}/`, scope);

  // 2. manifest + installability
  const manifest = await page.send('Page.getAppManifest');
  const parsed = manifest.data ? JSON.parse(manifest.data) : {};
  check('the manifest loads without errors', !manifest.errors?.length && !!manifest.data, (manifest.errors ?? []).map(e => e.message).join('; '));
  check('it has a name, a start address and standalone display', parsed.name === 'AbyEx' && parsed.start_url === '/app' && parsed.display === 'standalone');
  const purposes = (parsed.icons ?? []).map(i => `${i.sizes}:${i.purpose}`);
  check('it has 192 and 512 icons and a maskable one', ['192x192:any', '512x512:any', '512x512:maskable'].every(p => purposes.includes(p)), purposes.join(', '));
  const install = await page.send('Page.getInstallabilityErrors');
  check('the browser finds no reason the app cannot be installed', (install.installabilityErrors ?? []).length === 0, JSON.stringify(install.installabilityErrors ?? []));

  // 3. the page's states
  const text = () => page.evaluate('document.body.innerText');
  check('the settings page offers to enable notifications (state: default)', (await text()).includes('Get alerts on this device'));
  const png = async name => writeFileSync(join(shotsDir, `${name}.png`), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await png('1-default');

  // 4. the person allows notifications (granted here, as clicking Allow in the browser's prompt would), then turns them on
  await root_.send('Browser.grantPermissions', { origin, permissions: ['notifications'] });
  await page.send('Page.reload');
  await sleep(2500);
  check('with permission given but no subscription, the page says so (state: granted-not-subscribed)', (await text()).includes('Notifications are allowed, but this device'));
  await png('1b-allowed');
  const clicked = await page.evaluate(`(() => { const b = [...document.querySelectorAll('[role=button]')].find(n => n.textContent.trim() === 'Turn on'); b && b.click(); return !!b; })()`);
  check('the Turn on button is there to press', clicked);
  // Subscribing talks to the browser's push service (Microsoft or Google); give it up to 30 seconds.
  let after = '';
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    after = await text();
    if (after.includes('Receiving notifications on this device') || (await page.evaluate(`!!document.querySelector('[role=alertdialog]')`))) break;
  }
  const subscribed = after.includes('Receiving notifications on this device');
  check('enabling subscribes this browser and the page says so', subscribed, subscribed ? '' : 'error shown: ' + JSON.stringify(await page.evaluate(`(document.querySelector('[role=alertdialog]') || {}).innerText || null`)));
  await png('2-after-enable');

  const sub = await page.evaluate(`navigator.serviceWorker.ready.then(r => r.pushManager.getSubscription()).then(s => s ? s.endpoint.slice(0, 40) : null)`);
  check('the browser holds a real push subscription', !!sub, sub ?? '');

  // 5. a push reaches the worker and becomes a notification
  const reg = [...page.events].reverse().find(e => e.method === 'ServiceWorker.workerRegistrationUpdated')?.params.registrations?.[0];
  if (reg) {
    await page.send('ServiceWorker.deliverPushMessage', {
      origin, registrationId: reg.registrationId,
      data: JSON.stringify({ title: 'Payment due', body: 'John Mugisha, 75,000 RWF', tag: 'reminder-r1', url: '/app/debts?openId=d1', stay: true, timestamp: Date.now(), recipientRowId: 'n7' }),
    });
    await sleep(1200);
    const shown = await page.evaluate(`navigator.serviceWorker.ready.then(r => r.getNotifications()).then(list => list.map(n => ({ title: n.title, body: n.body, tag: n.tag, requireInteraction: n.requireInteraction, url: n.data && n.data.url })))`);
    check('a push delivered to the worker shows a notification', shown.length === 1 && shown[0].title === 'Payment due', JSON.stringify(shown));
    check('it is a reminder: kept on screen, and opens the debt', shown[0]?.requireInteraction === true && shown[0]?.url === '/app/debts?openId=d1');
  } else {
    check('the worker registration was seen by the browser', false);
  }

  // 6. the device list and test button
  const devicesText = await text();
  check('the device list shows this browser', /Your devices/.test(devicesText) && /This device/.test(devicesText));
  await png('3-devices');

  page.close(); root_.close();
} catch (e) {
  check('the check ran to the end', false, String(e.message ?? e));
} finally {
  browser.kill(); server.kill();
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* still in use */ }
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
