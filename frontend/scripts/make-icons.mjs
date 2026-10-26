// Makes the PWA icon set from the phone app's logo files, drawing in a real browser (no image library):
//   public/icons/icon-192.png, icon-512.png          the normal icons (the brand icon, scaled)
//   public/icons/icon-512-maskable.png               teal square + the logo inside the safe zone (round / squircle masks)
//   public/icons/apple-touch-icon.png                180x180 for iPhone and iPad home screens
//   public/icons/badge-96.png                        the small one-colour icon shown in the notification bar
// Run:  node scripts/make-icons.mjs
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const img = name => join(root, 'public', 'images', name);
const out = join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });
const dataUrl = file => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!exe) throw new Error('Edge or Chrome is needed to draw the icons');

const profile = mkdtempSync(join(tmpdir(), 'icons-'));
const port = 9800 + Math.floor(Math.random() * 100);
const browser = spawn(exe, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let url;
for (let i = 0; i < 60 && !url; i++) {
  try { url = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ }
  if (!url) await sleep(250);
}
const ws = new WebSocket(url);
await new Promise(r => { ws.onopen = r; });
let id = 0; const waiting = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
const evaluate = expression => new Promise((res, rej) => {
  const i = ++id;
  waiting.set(i, m => (m.result?.exceptionDetails ? rej(new Error(m.result.exceptionDetails.exception?.description)) : res(m.result.result.value)));
  ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});

const brand = dataUrl(img('logo/rabbit-icon.png'));
const foreground = dataUrl(img('logo/rabbit-adaptive.png'));

const draw = `(async () => {
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const brand = await load(${JSON.stringify(brand)});
  const fg = await load(${JSON.stringify(foreground)});
  const make = (size, paint) => { const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; paint(g, size); return c.toDataURL('image/png').split(',')[1]; };
  const result = {};
  result['icon-192.png'] = make(192, (g, s) => g.drawImage(brand, 0, 0, s, s));
  result['icon-512.png'] = make(512, (g, s) => g.drawImage(brand, 0, 0, s, s));
  result['apple-touch-icon.png'] = make(180, (g, s) => g.drawImage(brand, 0, 0, s, s));
  // Maskable: the whole square is brand teal; the logo foreground is already drawn for the adaptive-icon safe zone.
  result['icon-512-maskable.png'] = make(512, (g, s) => { g.fillStyle = '#00627F'; g.fillRect(0, 0, s, s); g.drawImage(fg, 0, 0, s, s); });
  return result;
})()`;

const files = await evaluate(draw);
for (const [name, b64] of Object.entries(files)) writeFileSync(join(out, name), Buffer.from(b64, 'base64'));
copyFileSync(img('logo/notification-icon.png'), join(out, 'badge-96.png'));
console.log('wrote', [...Object.keys(files), 'badge-96.png'].join(', '));

ws.close(); browser.kill(); await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold it */ }
