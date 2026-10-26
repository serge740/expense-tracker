import { describe, expect, test } from 'vitest';
import { endpointHash, urlBase64ToUint8Array } from './push';

describe('urlBase64ToUint8Array', () => {
  test('decodes the url-safe alphabet and missing padding (a real VAPID-length key)', () => {
    const key = 'BLrdo3MiGCzhmq4fbSuOmW3C8UaSgZS9VyfOWzycG6zLSYLOLRmIxdSI4HYSEEWH2IHGBOW6zP2FGbwF1axx0KM';
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes.length).toBe(65); // an uncompressed P-256 public key
    expect(bytes[0]).toBe(4);
  });
  test('maps - and _ to + and /', () => {
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255]);
  });
  test('empty is empty', () => {
    expect(urlBase64ToUint8Array('').length).toBe(0);
  });
});

describe('endpointHash', () => {
  test('is the first 12 hex digits of the SHA-256 (the same rule the server uses)', async () => {
    // sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(await endpointHash('abc')).toBe('ba7816bf8f01');
  });
  test('is stable and differs for different endpoints', async () => {
    const a = await endpointHash('https://push.example/1');
    expect(await endpointHash('https://push.example/1')).toBe(a);
    expect(await endpointHash('https://push.example/2')).not.toBe(a);
  });
});
