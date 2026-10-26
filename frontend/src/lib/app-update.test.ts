import { describe, expect, test, vi } from 'vitest';
import { CURRENT_BUILD, fetchLatestBuild, isNewBuild, parseBuild } from './app-update';

const reply = (body: unknown, ok = true, status = 200) =>
  vi.fn(async () => ({ ok, status, json: async () => body })) as unknown as typeof fetch;

describe('app update stamps', () => {
  test('the running app knows its own stamp', () => {
    expect(CURRENT_BUILD.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(Number.isNaN(new Date(CURRENT_BUILD.buildId).getTime())).toBe(false);
  });

  test('a stamp must have a version and a build id', () => {
    expect(parseBuild({ version: '1.0.0', buildId: '2026-01-01T00:00:00.000Z' })).toEqual({ version: '1.0.0', buildId: '2026-01-01T00:00:00.000Z' });
    expect(parseBuild({ version: '1.0.0' })).toBeNull();
    expect(parseBuild({ version: '', buildId: 'x' })).toBeNull();
    expect(parseBuild('<html>')).toBeNull();
    expect(parseBuild(null)).toBeNull();
  });

  test('a different build id is an update, the same one is not', () => {
    const a = { version: '1.0.0', buildId: '2026-01-01T00:00:00.000Z' };
    expect(isNewBuild(a, { ...a })).toBe(false);
    expect(isNewBuild(a, { version: '1.0.0', buildId: '2026-02-01T00:00:00.000Z' })).toBe(true);
    // the server being put back to an older build is also a difference worth loading
    expect(isNewBuild({ ...a, buildId: '2026-03-01T00:00:00.000Z' }, a)).toBe(true);
  });

  test('asks the server without using any cache', async () => {
    const fetcher = reply({ version: '1.0.1', buildId: 'b' });
    expect(await fetchLatestBuild(fetcher)).toEqual({ version: '1.0.1', buildId: 'b' });
    expect(fetcher).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
  });

  test('a server error, or a page that is not a stamp, is an error', async () => {
    await expect(fetchLatestBuild(reply({}, false, 503))).rejects.toThrow(/503/);
    await expect(fetchLatestBuild(reply('<html>'))).rejects.toThrow(/newest/);
    const html = vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('not json'); } })) as unknown as typeof fetch;
    await expect(fetchLatestBuild(html)).rejects.toThrow(/newest/);
  });
});
