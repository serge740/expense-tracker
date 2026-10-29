import { describe, expect, test } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * The family header is added by one place: the request interceptor in api.ts. A screen that called the server in any other
 * way (fetch, or its own axios) would bypass it and silently talk about the wrong space. This keeps that from happening.
 */
const ROOT = join(__dirname, '..');
const SKIP = new Set(['node_modules', '__tests__', '.expo', 'android', 'ios', 'assets', 'scripts']);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (SKIP.has(name)) return [];
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}
const files = sources(ROOT).map(f => ({ path: relative(ROOT, f).replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }));

describe('every request to our server goes through api.ts', () => {
  test('the scan sees the app', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some(f => f.path === 'api.ts')).toBe(true);
  });

  test('only api.ts talks to axios', () => {
    const users = files.filter(f => /from ['"]axios['"]|require\(['"]axios['"]\)/.test(f.text)).map(f => f.path);
    expect(users).toEqual(['api.ts']);
  });

  test('nothing calls fetch() on its own', () => {
    const users = files.filter(f => /(^|[^.\w])fetch\(/.test(f.text)).map(f => f.path);
    expect(users).toEqual([]);
  });

  test('api.ts adds the family header, and only through the shared helper', () => {
    const api = files.find(f => f.path === 'api.ts')!.text;
    expect(api).toContain('familyHeaderFor(config.url)');
    expect(api).toContain('handleScopeError(error)');
    expect(api).toContain('clearScopeOnSessionLoss()');
  });
});
