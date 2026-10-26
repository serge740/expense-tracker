// Copies files from ../expo_app into src/, rewriting the imports that only exist on a phone so they point at the
// web building blocks. Everything else is copied as written. Usage:  node scripts/port.mjs <dir-or-file> ...
// (paths relative to expo_app, e.g. "utils" or "app/(dashboard)/wallets.tsx"). Existing files are never overwritten
// unless --force is given.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPO = join(HERE, '..', '..', 'expo_app');
const SRC = join(HERE, '..', 'src');

// Files that came with the Expo project template and are not part of the app.
const TEMPLATE = [/components\/(themed-text|themed-view|external-link|haptic-tab|hello-wave|parallax-scroll-view)\./, /components\/ui\//, /^app\/\(tabs\)\//, /^app\/modal\./, /_layout\./, /^app\/index\./, /hooks\/use-(color-scheme|theme-color)/, /constants\/theme\.ts/];

function destination(rel) {
  let m;
  if ((m = rel.match(/^app\/\(auth\)\/(.+)$/))) return `screens/auth/${m[1]}`;
  if ((m = rel.match(/^app\/\(dashboard\)\/\(settings\)\/(.+)$/))) return `screens/settings/${m[1]}`;
  if ((m = rel.match(/^app\/\(dashboard\)\/(.+)$/))) return `screens/dashboard/${m[1] === 'index.tsx' ? 'home.tsx' : m[1]}`;
  return rel;
}

const RN_NAMES_OK = null; // everything from react-native goes to @/rn; the compiler reports what is missing
const ROUTER_NAMES = new Set(['router', 'useLocalSearchParams', 'useFocusEffect', 'Redirect', 'usePathname', 'useRouter']);

function parseClause(clause) {
  const out = { def: null, ns: null, named: [] };
  let rest = clause.trim();
  const ns = rest.match(/^\*\s+as\s+(\w+)$/);
  if (ns) { out.ns = ns[1]; return out; }
  const braces = rest.match(/\{([\s\S]*)\}/);
  if (braces) {
    out.named = braces[1].split(',').map(s => s.trim()).filter(Boolean);
    rest = rest.replace(braces[0], '').replace(/,\s*$/, '').trim();
  }
  if (rest) out.def = rest.replace(/,$/, '').trim();
  return out;
}

const named = (list, from) => (list.length ? `import { ${list.join(', ')} } from '${from}';` : '');

function rewriteImport(clause, source) {
  const c = parseClause(clause);
  const lines = [];
  switch (true) {
    case source === 'react-native' || source === 'react-native-safe-area-context':
      return named(c.named, '@/rn');
    case source === '@expo/vector-icons/MaterialIcons':
      return c.def === 'MaterialIcons' ? "import { MaterialIcons } from '@/rn';" : `import { MaterialIcons as ${c.def} } from '@/rn';`;
    case source === '@expo/vector-icons/MaterialCommunityIcons':
      return `import { MaterialCommunityIcons } from '@/rn/community-icons';`;
    case source === 'expo-router': {
      const mine = c.named.filter(n => ROUTER_NAMES.has(n));
      const other = c.named.filter(n => !ROUTER_NAMES.has(n));
      if (mine.length) lines.push(named(mine, '@/router/router'));
      if (other.length) lines.push(`${named(other, 'expo-router')} // TODO(port): not available on the web`);
      return lines.join('\n');
    }
    case source === 'expo-linear-gradient':
      return named(c.named, '@/rn/gradient');
    case source === 'react-native-svg': {
      const parts = [];
      if (c.def) parts.push(c.def);
      const nm = c.named.map(n => n.replace(/^LinearGradient\b/, 'LinearGradient'));
      return `import ${c.def ? c.def + (nm.length ? ', ' : '') : ''}${nm.length ? `{ ${nm.join(', ')} }` : ''} from '@/rn/svg';`;
    }
    case source === 'expo-haptics':
      return "import { Haptics } from '@/rn';";
    case source === 'expo-clipboard':
      return "import { Clipboard } from '@/rn';";
    case source.startsWith('expo') || source.startsWith('react-native-') || source === '@react-native-async-storage/async-storage': {
      if (source.startsWith('@react')) return "import AsyncStorage from '@/lib/shims/async-storage';";
      const shim = `@/lib/shims/${source.replace(/\/(legacy|providers\/.*)$/, '').replace(/\//g, '-')}`;
      if (c.ns) return `import * as ${c.ns} from '${shim}';`;
      const bits = [c.def, c.named.length ? `{ ${c.named.join(', ')} }` : ''].filter(Boolean).join(', ');
      return `import ${bits} from '${shim}';`;
    }
    default:
      return null; // leave as is
  }
}

export function convert(rel, text) {
  let out = text.replace(/^import\s+([\s\S]*?)\s+from\s+'([^']+)';?[ \t]*$/gm, (whole, clause, source) => {
    if (/^import\s+type\b/.test(whole) && source !== 'react-native') return whole;
    const next = rewriteImport(clause, source);
    return next === null ? whole : next;
  });
  out = out
    .replace(/(?:React.)?ComponentProps<typeof MaterialIcons>\['name'\]/g, 'string')
    .replace(/(?:React.)?ComponentProps<typeof MaterialCommunityIcons>\['name'\]/g, 'string')
    .replace(/require\('@\/assets\/images\/([^']+)'\)/g, "'/images/$1'");
  return `// Ported from expo_app/${rel}\n${out}`;
}

function* walk(path) {
  const st = statSync(path);
  if (st.isDirectory()) for (const e of readdirSync(path)) yield* walk(join(path, e));
  else if (/\.(ts|tsx)$/.test(path)) yield path;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const force = process.argv.includes('--force');
  const targets = process.argv.slice(2).filter(a => a !== '--force');
  const done = [], skipped = [], exists = [];
  for (const t of targets) {
    for (const file of walk(join(EXPO, t))) {
      const rel = relative(EXPO, file).replace(/\\/g, '/');
      if (TEMPLATE.some(r => r.test(rel))) { skipped.push(rel); continue; }
      const target = join(SRC, destination(rel));
      if (existsSync(target) && !force) { exists.push(rel); continue; }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, convert(rel, readFileSync(file, 'utf8')));
      done.push(rel);
    }
  }
  console.log(`ported ${done.length}, kept existing ${exists.length}, skipped template ${skipped.length}`);
  if (exists.length) console.log('  kept (already hand-written):', exists.join(', '));
}
