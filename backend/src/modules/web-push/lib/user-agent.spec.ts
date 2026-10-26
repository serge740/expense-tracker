import { parseUserAgent } from './user-agent';

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
const EDGE_WIN = `${CHROME_WIN} Edg/127.0.2651.74`;
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const FIREFOX_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0';

describe('parseUserAgent', () => {
  it('reads Chrome on Windows as a desktop', () => {
    expect(parseUserAgent(CHROME_WIN)).toEqual({ browser: 'Chrome 127', os: 'Windows 10/11', deviceType: 'DESKTOP' });
  });
  it('calls Edge Edge, not Chrome', () => {
    expect(parseUserAgent(EDGE_WIN).browser).toBe('Edge 127');
  });
  it('reads a phone', () => {
    expect(parseUserAgent(CHROME_ANDROID)).toEqual({ browser: 'Chrome 127', os: 'Android 14', deviceType: 'MOBILE' });
    expect(parseUserAgent(SAFARI_IPHONE)).toEqual({ browser: 'Safari 17', os: 'iOS 17', deviceType: 'MOBILE' });
  });
  it('reads an Android tablet (no "Mobile" in the text)', () => {
    expect(parseUserAgent(ANDROID_TABLET).deviceType).toBe('TABLET');
  });
  it('reads Firefox on a Mac', () => {
    expect(parseUserAgent(FIREFOX_MAC)).toEqual({ browser: 'Firefox 128', os: 'macOS', deviceType: 'DESKTOP' });
  });
  it('copes with nothing', () => {
    expect(parseUserAgent(undefined)).toEqual({ browser: null, os: null, deviceType: 'DESKTOP' });
    expect(parseUserAgent('')).toEqual({ browser: null, os: null, deviceType: 'DESKTOP' });
  });
});
