// Builds the web app and puts the result inside the backend, in backend/web, so the server can serve it from there.
//   npm run build:web
// It needs the frontend folder next to this one (a normal checkout of the repository, including on Render).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const backend = resolve(import.meta.dirname, '..');
const frontend = resolve(backend, '..', 'frontend');
const target = join(backend, 'web');

if (!existsSync(join(frontend, 'package.json'))) {
  console.error(`The web app was not found at ${frontend}. Build it where the whole repository is checked out.`);
  process.exit(1);
}

const run = (args, label) => {
  console.log(`\n> ${label}`);
  const r = spawnSync('npm', args, { cwd: frontend, stdio: 'inherit', shell: true });
  if (r.status !== 0) { console.error(`\n"${label}" failed.`); process.exit(r.status ?? 1); }
};

// The web app's own packages, if they are not installed yet (a fresh server).
if (!existsSync(join(frontend, 'node_modules'))) run(['install', '--no-audit', '--no-fund'], 'npm install (frontend)');
run(['run', 'build'], 'npm run build (frontend)');

const built = join(frontend, 'dist');
if (!existsSync(join(built, 'index.html'))) { console.error('The build produced no index.html.'); process.exit(1); }

// Replace the old copy. Only ever touches backend/web.
if (existsSync(target)) {
  if (resolve(target) !== join(backend, 'web')) throw new Error('refusing to delete an unexpected folder');
  rmSync(target, { recursive: true, force: true });
}
mkdirSync(target, { recursive: true });
cpSync(built, target, { recursive: true });
console.log(`\nCopied the web app into ${target} (${statSync(join(target, 'index.html')).size} bytes of index.html).`);
