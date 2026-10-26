// Makes the AbyExpense logo files from the artwork in scripts/brand/aby-source.png (drawn in a real browser, no image library):
//   public/images/logo/aby-logo.png       the whole logo (mark + "AbyExpense"), trimmed, on pure white
//   public/images/logo/aby-icon.png       just the mark, square, on pure white (favicon, app icon, notification icon)
//   public/images/logo/aby-mark-mono.png  the mark as a white shape on transparent (the small notification-bar badge)
// The rabbit files next to them are never touched. Run:  node scripts/make-brand.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withBrowser } from './lib/draw.mjs';

const root = join(import.meta.dirname, '..');
const source = `data:image/png;base64,${readFileSync(join(root, 'scripts/brand/aby-source.png')).toString('base64')}`;
const out = join(root, 'public', 'images', 'logo');

const draw = `(async () => {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = ${JSON.stringify(source)}; });
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, W, H).data;

  // The artwork's own paper colour (the average of a small patch in each corner).
  const bg = [0, 0, 0]; let n = 0;
  for (const [x0, y0] of [[0, 0], [W - 20, 0], [0, H - 20], [W - 20, H - 20]]) for (let y = y0; y < y0 + 20; y++) for (let x = x0; x < x0 + 20; x++) { const k = (y * W + x) * 4; bg[0] += px[k]; bg[1] += px[k + 1]; bg[2] += px[k + 2]; n++; }
  for (let i = 0; i < 3; i++) bg[i] /= n;

  // Where is there ink? (anything clearly different from the paper)
  const ink = (x, y) => { const k = (y * W + x) * 4; return Math.abs(px[k] - bg[0]) + Math.abs(px[k + 1] - bg[1]) + Math.abs(px[k + 2] - bg[2]) > 60; };
  const rows = new Array(H).fill(false);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ink(x, y)) { rows[y] = true; break; }
  const boundsOf = (y0, y1) => {
    let minX = W, maxX = -1, minY = H, maxY = -1;
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) if (ink(x, y)) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  };
  const full = boundsOf(0, H);
  // The mark and the words are separated by the widest empty band of rows.
  let gapStart = -1, best = { len: 0, at: 0 };
  for (let y = full.y; y <= full.y + full.h; y++) {
    if (!rows[y]) { if (gapStart < 0) gapStart = y; } else if (gapStart >= 0) { if (y - gapStart > best.len) best = { len: y - gapStart, at: gapStart }; gapStart = -1; }
  }
  const mark = boundsOf(0, best.at);

  // Shifts the paper colour to pure white and leaves everything else (the anti-aliased edges too) in proportion.
  const whiten = (ctx, w, h) => {
    const d = ctx.getImageData(0, 0, w, h); const p = d.data;
    for (let i = 0; i < p.length; i += 4) for (let j = 0; j < 3; j++) p[i + j] = Math.min(255, p[i + j] + (255 - bg[j]));
    // The artwork has faint grey speckle in the "white" (compression noise) that would show as a pale box on a white page: very light pixels are pulled to pure white, smoothly so the edges stay soft.
    for (let i = 0; i < p.length; i += 4) { const v = Math.min(p[i], p[i + 1], p[i + 2]); if (v > 232) { const t = Math.min(1, (v - 232) / 14); for (let j = 0; j < 3; j++) p[i + j] = Math.round(p[i + j] + (255 - p[i + j]) * t); } }
    ctx.putImageData(d, 0, 0);
  };
  const canvas = (w, h) => { const k = document.createElement('canvas'); k.width = w; k.height = h; return k; };
  const png = k => k.toDataURL('image/png').split(',')[1];

  // 1. The whole logo, trimmed, with a little air around it, at most 640 wide (it is never shown bigger than about 300).
  const pad = Math.round(Math.max(full.w, full.h) * 0.04);
  const k1 = Math.min(1, 640 / (full.w + pad * 2));
  const logo = canvas(Math.round((full.w + pad * 2) * k1), Math.round((full.h + pad * 2) * k1)); const lg = logo.getContext('2d', { willReadFrequently: true });
  lg.imageSmoothingQuality = 'high';
  lg.fillStyle = '#fff'; lg.fillRect(0, 0, logo.width, logo.height);
  lg.drawImage(img, full.x, full.y, full.w, full.h, pad * k1, pad * k1, full.w * k1, full.h * k1);
  whiten(lg, logo.width, logo.height);

  // 2. The mark alone: square, 512, the mark filling 72% so it has room on a home screen.
  const S = 512, inner = Math.round(S * 0.72), scale = inner / Math.max(mark.w, mark.h);
  const icon = canvas(S, S); const ig = icon.getContext('2d', { willReadFrequently: true });
  ig.imageSmoothingQuality = 'high';
  ig.fillStyle = '#fff'; ig.fillRect(0, 0, S, S);
  ig.drawImage(img, mark.x, mark.y, mark.w, mark.h, (S - mark.w * scale) / 2, (S - mark.h * scale) / 2, mark.w * scale, mark.h * scale);
  whiten(ig, S, S);

  // 3. A one-colour version for the notification bar: every inked pixel becomes white, the rest transparent.
  const B = 96, bscale = (B * 0.86) / Math.max(mark.w, mark.h);
  const tmp = canvas(B, B); const tg = tmp.getContext('2d', { willReadFrequently: true });
  tg.imageSmoothingQuality = 'high'; tg.fillStyle = '#fff'; tg.fillRect(0, 0, B, B);
  tg.drawImage(img, mark.x, mark.y, mark.w, mark.h, (B - mark.w * bscale) / 2, (B - mark.h * bscale) / 2, mark.w * bscale, mark.h * bscale);
  const t = tg.getImageData(0, 0, B, B); const tp = t.data;
  for (let i = 0; i < tp.length; i += 4) {
    const dist = Math.abs(tp[i] - 255) + Math.abs(tp[i + 1] - 255) + Math.abs(tp[i + 2] - 255);
    tp[i] = tp[i + 1] = tp[i + 2] = 255; tp[i + 3] = Math.max(0, Math.min(255, Math.round((dist - 25) * 2.2)));
  }
  tg.putImageData(t, 0, 0);

  return { bg, full, mark, gap: best, logo: [logo.width, logo.height], files: { 'aby-logo.png': png(logo), 'aby-icon.png': png(icon), 'aby-mark-mono.png': png(tmp) } };
})()`;

const result = await withBrowser(evaluate => evaluate(draw));
for (const [name, b64] of Object.entries(result.files)) writeFileSync(join(out, name), Buffer.from(b64, 'base64'));
console.log('paper colour', result.bg.map(Math.round).join(','), '| whole logo', JSON.stringify(result.full), '| mark', JSON.stringify(result.mark), '| gap', JSON.stringify(result.gap));
console.log('wrote', Object.keys(result.files).join(', '));
