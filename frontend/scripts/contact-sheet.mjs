// Puts every PNG of a folder on one page (a contact sheet) so many screens can be reviewed at a glance.
//   node scripts/contact-sheet.mjs <folder> [columns] [names...]
import { readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [folder, cols = '5', ...names] = process.argv.slice(2);
const dir = resolve(folder);
const files = readdirSync(dir).filter(f => f.endsWith('.png') && f !== 'sheet.png' && (!names.length || names.includes(f.replace('.png', ''))));
const cell = Math.floor(1900 / Number(cols)) - 12;
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:8px;background:#222;font:12px system-ui;color:#ddd;display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:12px}
figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{padding:4px 2px;font-weight:600}
</style>${files.map(f => `<figure><figcaption>${f.replace('.png', '')}</figcaption><img src="${pathToFileURL(join(dir, f)).href}"></figure>`).join('')}`;
writeFileSync(join(dir, 'sheet.html'), html);
console.log(pathToFileURL(join(dir, 'sheet.html')).href, files.length);
