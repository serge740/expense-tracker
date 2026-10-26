// Makes the PWA icon set from a logo, drawing in a real browser (no image library):
//   public/icons/icon-192.png, icon-512.png          the normal icons
//   public/icons/icon-512-maskable.png               a full square background + the logo inside the safe zone (round / squircle masks)
//   public/icons/apple-touch-icon.png                180x180 for iPhone and iPad home screens
//   public/icons/badge-96.png                        the small one-colour icon shown in the notification bar
// Run:  node scripts/make-icons.mjs            the AbyExpense logo (white background), made by make-brand.mjs
//       node scripts/make-icons.mjs --brand rabbit   the old rabbit set (teal background), to go back
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withBrowser } from './lib/draw.mjs';

const root = join(import.meta.dirname, '..');
const img = name => join(root, 'public', 'images', name);
const out = join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });
const dataUrl = file => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

const at = process.argv.indexOf('--brand');
const brandName = at >= 0 ? process.argv[at + 1] : 'aby';
const SETS = {
  // The mark sits in the middle of a white square, with room around it (already built into aby-icon.png).
  aby: { icon: 'logo/aby-icon.png', foreground: 'logo/aby-icon.png', maskableBackground: '#FFFFFF', maskableScale: 0.82, badge: 'logo/aby-mark-mono.png' },
  rabbit: { icon: 'logo/rabbit-icon.png', foreground: 'logo/rabbit-adaptive.png', maskableBackground: '#00627F', maskableScale: 1, badge: 'logo/notification-icon.png' },
};
const set = SETS[brandName];
if (!set) throw new Error(`unknown brand "${brandName}" (use aby or rabbit)`);

const brand = dataUrl(img(set.icon));
const foreground = dataUrl(img(set.foreground));

const draw = `(async () => {
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const brand = await load(${JSON.stringify(brand)});
  const fg = await load(${JSON.stringify(foreground)});
  const make = (size, paint) => { const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; paint(g, size); return c.toDataURL('image/png').split(',')[1]; };
  const result = {};
  result['icon-192.png'] = make(192, (g, s) => g.drawImage(brand, 0, 0, s, s));
  result['icon-512.png'] = make(512, (g, s) => g.drawImage(brand, 0, 0, s, s));
  result['apple-touch-icon.png'] = make(180, (g, s) => g.drawImage(brand, 0, 0, s, s));
  // Maskable: the whole square is the background colour; the logo is drawn inside the safe zone.
  result['icon-512-maskable.png'] = make(512, (g, s) => {
    g.fillStyle = ${JSON.stringify(set.maskableBackground)}; g.fillRect(0, 0, s, s);
    const k = ${set.maskableScale}; g.drawImage(fg, s * (1 - k) / 2, s * (1 - k) / 2, s * k, s * k);
  });
  return result;
})()`;

const files = await withBrowser(evaluate => evaluate(draw));
for (const [name, b64] of Object.entries(files)) writeFileSync(join(out, name), Buffer.from(b64, 'base64'));
copyFileSync(img(set.badge), join(out, 'badge-96.png'));
console.log(`(${brandName})`, 'wrote', [...Object.keys(files), 'badge-96.png'].join(', '));
