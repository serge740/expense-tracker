import { BadRequestException, ConflictException, HttpException, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { SAY, toFriendly } from './friendly-errors';
import { familyError } from '../modules/family/family-errors';

const prisma = (code: string, name = 'PrismaClientKnownRequestError') => Object.assign(new Error('Invalid `prisma.x.create()` invocation: secret details'), { name, code });
const NO_TECH = /prisma|invalid `|constraint|P20\d\d|ECONN|stack|sql/i;

describe('friendly errors', () => {
  test('a message written for people passes through, with its status and code', () => {
    const f = toFriendly(new BadRequestException('Enter an amount greater than zero.'));
    expect([f.status, f.body.message, f.log]).toEqual([400, 'Enter an amount greater than zero.', false]);
    expect(toFriendly(new NotFoundException('Transaction not found'))).toMatchObject({ status: 404, body: { message: 'Transaction not found' } });
    expect(toFriendly(new ConflictException('Changed a moment ago'))).toMatchObject({ status: 409 });
    const fam = toFriendly(familyError(403, 'FORBIDDEN_ACTION', 'Your role does not allow this'));
    expect([fam.status, fam.body.code, fam.body.message]).toEqual([403, 'FORBIDDEN_ACTION', 'Your role does not allow this']);
  });

  test('database errors become sentences, and the cause is logged, never sent', () => {
    for (const [code, status, key] of [['P2002', 409, 'ALREADY_EXISTS'], ['P2025', 404, 'NOT_FOUND_ANYMORE'], ['P2003', 409, 'LINKED'], ['P2000', 400, 'TOO_LONG'], ['P2034', 409, 'TRY_AGAIN'], ['P1001', 503, 'SERVICE_BUSY']] as const) {
      const f = toFriendly(prisma(code));
      expect([f.status, f.body.code, f.body.message]).toEqual([status, key, SAY[key]]);
      expect(f.body.message).not.toMatch(NO_TECH);
    }
    expect(toFriendly(prisma('x', 'PrismaClientValidationError'))).toMatchObject({ status: 400, body: { code: 'BAD_INPUT' } });
    expect(toFriendly(prisma('x', 'PrismaClientInitializationError'))).toMatchObject({ status: 503, body: { code: 'SERVICE_BUSY' } });
    expect(toFriendly(prisma('P9999')).status).toBe(500);
  });

  test('the rate limit, big files and unreadable requests are explained', () => {
    expect(toFriendly(new HttpException('ThrottlerException: Too Many Requests', 429))).toMatchObject({ status: 429, body: { code: 'TOO_MANY_REQUESTS', message: SAY.TOO_MANY_REQUESTS } });
    expect(toFriendly(Object.assign(new Error('File too large'), { name: 'MulterError', code: 'LIMIT_FILE_SIZE' }))).toMatchObject({ status: 413, body: { code: 'FILE_TOO_LARGE' } });
    expect(toFriendly(Object.assign(new Error('x'), { type: 'entity.too.large' })).status).toBe(413);
    expect(toFriendly(Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed' }))).toMatchObject({ status: 400, body: { code: 'UNREADABLE' } });
  });

  test('our own mistakes say sorry and are logged; developer wording is replaced', () => {
    const boom = toFriendly(new TypeError('Cannot read properties of undefined (reading x)'));
    expect([boom.status, boom.body.code, boom.log]).toEqual([500, 'SERVER_ERROR', true]);
    const five = toFriendly(new InternalServerErrorException('Cloudinary upload failed: ECONNRESET'));
    expect([five.status, five.body.message, five.log]).toEqual([500, SAY.SERVER_ERROR, true]);
    expect(toFriendly(new BadRequestException('Google sign-in is not set up on the server')).body.code).toBe('NOT_AVAILABLE');
    expect(toFriendly(new UnauthorizedException('Invalid refresh token')).body.code).toBe('SESSION_ENDED');
    expect(toFriendly(new BadRequestException('Failed to fetch wallets')).body.message).toBe(SAY.SERVER_ERROR);
    expect(toFriendly(new BadRequestException('Invalid `prisma.wallet.update()` invocation')).body.message).not.toMatch(NO_TECH);
  });

  test('a list of messages becomes one sentence', () => {
    expect(toFriendly(new BadRequestException({ message: ['name is required', 'amount must be a number'] })).body.message).toBe('name is required amount must be a number');
  });
});
