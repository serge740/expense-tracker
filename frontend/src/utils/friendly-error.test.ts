import { describe, expect, test } from 'vitest';
import { friendlyMessage, friendlyize, isOffline, plain } from './friendly-error';

const http = (status: number, data: Record<string, unknown>) => ({ response: { status, data } });

describe('friendly errors in the app', () => {
  test('no internet and timeouts are explained', () => {
    const off = { code: 'ERR_NETWORK', message: 'Network Error' };
    expect(isOffline(off)).toBe(true);
    expect(friendlyMessage(off)).toBe(plain('err.offline'));
    expect(friendlyMessage({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' })).toBe(plain('err.timeout'));
    expect(isOffline(http(500, {}))).toBe(false);
  });
  test('server codes and statuses become plain sentences', () => {
    expect(friendlyMessage(http(409, { code: 'ALREADY_EXISTS', message: 'x' }))).toBe(plain('err.ALREADY_EXISTS'));
    expect(friendlyMessage(http(429, { message: 'ThrottlerException' }))).toBe(plain('err.TOO_MANY_REQUESTS'));
    expect(friendlyMessage(http(502, { message: 'upstream blew up' }))).toBe(plain('err.SERVER_ERROR'));
  });
  test('known validation sentences are translated, other human sentences pass through', () => {
    expect(friendlyMessage(http(400, { message: 'Enter an amount greater than zero.' }))).toBe(plain('srv.amount'));
    expect(friendlyMessage(http(400, { message: 'Your role does not allow this' }))).toBe('Your role does not allow this');
    expect(friendlyMessage({}, 'Fallback')).toBe('Fallback');
    expect(friendlyMessage({})).toBe(plain('err.tryAgain'));
  });
  test('friendlyize rewrites the message screens read', () => {
    const e: any = http(500, { message: 'Invalid `prisma.x`' });
    friendlyize(e);
    expect(e.response.data.message).toBe(plain('err.SERVER_ERROR'));
  });
});
