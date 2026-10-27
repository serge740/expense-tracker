import { describe, expect, test } from 'vitest';
import { isInAppBrowser, isIosDevice } from './platform';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const MAC = IPAD_AS_MAC;
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.20.109';
const FACEBOOK = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/460.0]';

describe('isIosDevice', () => {
  test('an iPhone is iOS', () => expect(isIosDevice(IPHONE, 5)).toBe(true));
  test('an iPad that says it is a Mac (iPadOS 13 and later) is iOS: it has a touch screen', () => expect(isIosDevice(IPAD_AS_MAC, 5)).toBe(true));
  test('a real Mac, with no touch screen, is not', () => expect(isIosDevice(MAC, 0)).toBe(false));
  test('Android is not', () => expect(isIosDevice(ANDROID, 5)).toBe(false));
});

describe('isInAppBrowser', () => {
  test('Instagram and Facebook built-in browsers are', () => {
    expect(isInAppBrowser(INSTAGRAM)).toBe(true);
    expect(isInAppBrowser(FACEBOOK)).toBe(true);
  });
  test('Safari and Chrome are not', () => {
    expect(isInAppBrowser(IPHONE)).toBe(false);
    expect(isInAppBrowser(ANDROID)).toBe(false);
  });
});
