// Draws pictures in a real browser (Edge or Chrome) so no image library is needed.
//   await withBrowser(async evaluate => { const result = await evaluate('(async () => ...)()'); })
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function withBrowser(run) {
  const exe = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].find(existsSync);
  if (!exe) throw new Error('Edge or Chrome is needed to draw the pictures');

  const profile = mkdtempSync(join(tmpdir(), 'draw-'));
  const port = 9800 + Math.floor(Math.random() * 100);
  const browser = spawn(exe, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
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
  try {
    return await run(evaluate);
  } finally {
    ws.close(); browser.kill(); await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold it */ }
  }
}
