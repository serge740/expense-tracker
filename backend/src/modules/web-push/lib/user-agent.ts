export type DeviceType = 'MOBILE' | 'TABLET' | 'DESKTOP';

export type ParsedAgent = { browser: string | null; os: string | null; deviceType: DeviceType };

const BROWSERS: { name: string; pattern: RegExp }[] = [
  { name: 'Edge', pattern: /Edg(?:e|A|iOS)?\/(\d+)/ },
  { name: 'Opera', pattern: /OPR\/(\d+)/ },
  { name: 'Firefox', pattern: /(?:Firefox|FxiOS)\/(\d+)/ },
  { name: 'Chrome', pattern: /(?:Chrome|CriOS)\/(\d+)/ },
  { name: 'Safari', pattern: /Version\/(\d+).*Safari/ },
];

function parseBrowser(ua: string): string | null {
  for (const { name, pattern } of BROWSERS) {
    const match = pattern.exec(ua);
    if (match) return `${name} ${match[1]}`;
  }
  return null;
}

function parseOs(ua: string): string | null {
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  if (android) return `Android ${android[1]}`;
  const ios = /(?:iPhone|iPad|CPU) OS (\d+)/.exec(ua);
  if (ios) return `iOS ${ios[1]}`;
  if (/Windows NT 10\.0/.test(ua)) return 'Windows 10/11';
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return null;
}

function parseDeviceType(ua: string): DeviceType {
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobi/.test(ua))) return 'TABLET';
  if (/Mobi|iPhone/.test(ua)) return 'MOBILE';
  return 'DESKTOP';
}

/** Best-effort labels for the device list. Unknown parts come back null. */
export function parseUserAgent(ua: string | null | undefined): ParsedAgent {
  const value = (ua ?? '').slice(0, 400);
  return { browser: parseBrowser(value), os: parseOs(value), deviceType: parseDeviceType(value) };
}
