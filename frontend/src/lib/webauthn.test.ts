import { describe, expect, test } from 'vitest';
import { b64urlToBuffer, bufferToB64url } from './webauthn';

const bytes = (b: ArrayBuffer) => Array.from(new Uint8Array(b));

describe('base64url', () => {
  test('round-trips arbitrary bytes, including ones that need - and _', () => {
    const input = new Uint8Array([0, 251, 255, 62, 63, 1, 2, 3, 250]);
    const text = bufferToB64url(input.buffer);
    expect(text).not.toMatch(/[+/=]/);
    expect(bytes(b64urlToBuffer(text))).toEqual(Array.from(input));
  });
  test('decodes known values', () => {
    expect(bytes(b64urlToBuffer('SGk'))).toEqual([72, 105]); // "Hi", no padding
    expect(bufferToB64url(new Uint8Array([72, 105]).buffer)).toBe('SGk');
  });
  test('uses the url alphabet', () => {
    expect(bufferToB64url(new Uint8Array([251, 255]).buffer)).toBe('-_8');
    expect(bytes(b64urlToBuffer('-_8'))).toEqual([251, 255]);
  });
  test('an empty value is an empty buffer', () => {
    expect(bytes(b64urlToBuffer(''))).toEqual([]);
    expect(bufferToB64url(new ArrayBuffer(0))).toBe('');
  });
});
