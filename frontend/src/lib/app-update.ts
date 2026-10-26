/**
 * Knowing whether a newer version of the app has been published. Every build has a stamp (version + build time).
 * The running app carries its own stamp; the server's newest one is in /version.json, which is never cached.
 */
export interface Build { version: string; buildId: string }

export const CURRENT_BUILD: Build = { version: __APP_VERSION__, buildId: __BUILD_ID__ };

/** Reads a stamp from whatever the server returned; null when it is not one (for example an HTML page). */
export function parseBuild(raw: unknown): Build | null {
  if (!raw || typeof raw !== 'object') return null;
  const { version, buildId } = raw as Record<string, unknown>;
  if (typeof version !== 'string' || typeof buildId !== 'string' || !version || !buildId) return null;
  return { version, buildId };
}

/** Asks the server for its newest stamp. Throws if it cannot be reached or does not answer with one. */
export async function fetchLatestBuild(fetcher: typeof fetch = fetch): Promise<Build> {
  const res = await fetcher('/version.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`The server answered ${res.status}`);
  const build = parseBuild(await res.json().catch(() => null));
  if (!build) throw new Error('The server did not say which version is newest');
  return build;
}

/** Any other stamp is an update (it also covers the server being put back to an older build). */
export const isNewBuild = (current: Build, latest: Build): boolean => latest.buildId !== current.buildId;

export const CHECK_EVERY_MS = 30 * 60 * 1000;
/** Coming back to the app checks too, unless it was checked this recently. */
export const RECHECK_AFTER_MS = 10 * 60 * 1000;
