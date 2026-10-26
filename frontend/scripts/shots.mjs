// Takes screenshots of the running web app in a real (headless) browser and can click / type first.
// No libraries: it drives Edge or Chrome through the DevTools protocol with Node's built-in WebSocket.
//
//   node scripts/shots.mjs --base http://localhost:4180 --out shots --scheme light \
//        home:/app  "add:/app/add|click=Take photo"  login:/login
//
// Each item is  name:/path  optionally followed by  |step|step…  Steps: click=<visible text>, type=<placeholder>=<text>,
// wait=<ms>, scroll=<px>, eval=<javascript>. Add ?mock=1 to the path (or use --mock) for sample data.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const flag = name => args.includes(`--${name}`);
const base = opt('base', 'http://localhost:4180');
const outDir = opt('out', 'shots');
const scheme = opt('scheme', 'light');
const width = Number(opt('width', 430));
const height = Number(opt('height', 932));
const settle = Number(opt('settle', 1800));
const items = args.filter((a, i) => !a.startsWith('--') && !['--base', '--out', '--scheme', '--width', '--height', '--settle'].includes(args[i - 1]));

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const exe = BROWSERS.find(existsSync);
if (!exe) { console.error('No Edge or Chrome found'); process.exit(1); }

mkdirSync(outDir, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'shots-'));
const port = 9300 + Math.floor(Math.random() * 500);
const browser = spawn(exe, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Browser did not start');
}

const ws = new WebSocket(await connect());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const waiting = new Map();
const logs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(`${m.params.type}: ${m.params.args.map(a => a.value ?? a.description).join(' ')}`);
  if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed');
  return r.result.value;
};

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });

const clickText = text => evaluate(`(() => {
  const want = ${JSON.stringify(text)}.toLowerCase();
  const nodes = [...document.querySelectorAll('[role=button],[role=tab],[role=switch],button,a,input,div,span')];
  const hit = nodes.filter(n => (n.getAttribute('aria-label') || n.textContent || '').trim().toLowerCase() === want && n.getBoundingClientRect().width > 0).pop()
           || nodes.filter(n => (n.getAttribute('aria-label') || n.textContent || '').trim().toLowerCase().includes(want) && n.getBoundingClientRect().width > 0).pop();
  if (!hit) return 'not found: ' + want;
  (hit.closest('[role=button],[role=tab],[role=switch],button,a') || hit).click();
  return 'clicked';
})()`);

const typeInto = (placeholder, text) => evaluate(`(() => {
  const el = [...document.querySelectorAll('input,textarea')].find(i => (i.placeholder || i.getAttribute('aria-label') || '').toLowerCase().includes(${JSON.stringify(placeholder)}.toLowerCase()));
  if (!el) return 'not found: ' + ${JSON.stringify(placeholder)};
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(text)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()`);

let failed = 0;
for (const item of items) {
  const [head, ...steps] = item.split('|');
  const name = head.slice(0, head.indexOf(':'));
  let path = head.slice(head.indexOf(':') + 1);
  if (flag('mock') && !/[?&]mock=/.test(path)) path += (path.includes('?') ? '&' : '?') + 'mock=1';
  logs.length = 0;
  await send('Page.navigate', { url: base + path });
  await sleep(500);
  await evaluate(`document.fonts.ready.then(() => true)`);
  await sleep(settle);
  const notes = [];
  for (const step of steps) {
    const [k, ...rest] = step.split('=');
    const v = rest.join('=');
    if (k === 'click') notes.push(await clickText(v));
    else if (k === 'type') { const [ph, ...t] = v.split('='); notes.push(await typeInto(ph, t.join('='))); }
    else if (k === 'wait') await sleep(Number(v));
    else if (k === 'scroll') await evaluate(`(() => { const s = [...document.querySelectorAll('div')].filter(d => d.scrollHeight > d.clientHeight + 10 && getComputedStyle(d).overflowY !== 'visible').sort((a, b) => b.scrollHeight - a.scrollHeight)[0]; if (s) s.scrollTop = ${Number(v)}; return true; })()`);
    else if (k === 'eval') notes.push(String(await evaluate(v)));
    await sleep(500);
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(shot.data, 'base64'));
  const bad = notes.filter(n => /not found/.test(n));
  if (bad.length) failed++;
  console.log(`ok ${name}${notes.length ? '  [' + notes.join('; ') + ']' : ''}`);
  for (const l of logs.slice(0, 6)) console.log('   console ' + l.slice(0, 240));
}

ws.close();
browser.kill();
await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold it */ }
process.exit(failed ? 1 : 0);
