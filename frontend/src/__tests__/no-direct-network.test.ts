import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The family header is added by one place: the request interceptor in lib/api.ts. A screen that called our server in any
 * other way (fetch, or its own axios) would bypass it and silently talk about the wrong space. This keeps that from happening.
 */
const ROOT = join(__dirname, '..');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (['__tests__', 'dev'].includes(name)) return [];
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}
const files = sources(ROOT).map(f => ({ path: relative(ROOT, f).replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }));

/** These three read a file or a picture that is on the person's own device (a blob: or data: address), never our server. */
const LOCAL_FETCH = ['lib/download.ts', 'services/client-auth.service.ts', 'services/receipts.service.ts'];

describe('every request to our server goes through lib/api.ts', () => {
  test('the scan sees the app', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some(f => f.path === 'lib/api.ts')).toBe(true);
  });
  test('only lib/api.ts talks to axios', () => {
    expect(files.filter(f => /from ['"]axios['"]/.test(f.text)).map(f => f.path)).toEqual(['lib/api.ts']);
  });
  test('fetch() is used only to read local files, never the server', () => {
    const users = files.filter(f => /(^|[^.\w])fetch\(/.test(f.text)).map(f => f.path).sort();
    expect(users).toEqual([...LOCAL_FETCH].sort());
    for (const path of LOCAL_FETCH) {
      const text = files.find(f => f.path === path)!.text;
      expect(text).not.toMatch(/fetch\(\s*(`|ENV|API_URL|['"]\/)/);
    }
  });
  test('lib/api.ts adds the family header, and only through the shared helper', () => {
    const api = files.find(f => f.path === 'lib/api.ts')!.text;
    expect(api).toContain('familyHeaderFor(config.url)');
    expect(api).toContain('handleScopeError(error)');
    expect(api).toContain('clearScopeOnSessionLoss()');
  });
});
