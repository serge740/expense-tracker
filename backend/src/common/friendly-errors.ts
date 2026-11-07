import { HttpException } from '@nestjs/common';

/**
 * Whatever goes wrong inside the server, the person gets a short sentence they can act on, never a database or framework message.
 * Messages that were written for people (most of them) pass through unchanged. Anything technical becomes one of the sentences
 * below, together with a `code` the app translates into the person's language.
 */
export interface FriendlyBody { statusCode: number; message: string; code?: string; error?: string; [k: string]: unknown }
export interface Friendly { status: number; body: FriendlyBody; /** True when the real cause should be logged. */ log: boolean }

export const SAY = {
  TOO_MANY_REQUESTS: 'No worries, just give it a moment and try again. Everything is fine.',
  FILE_TOO_LARGE: 'That file is a bit too big for us. Please pick one under 10 MB and you are all set.',
  SERVER_ERROR: 'Sorry, we hit a small problem on our side. Your money records are safe. Please try again in a moment.',
  SERVICE_BUSY: 'We are a little busy right now, but your information is safe. Please try again in a moment.',
  ALREADY_EXISTS: 'Good news, that is already here, so there is nothing more to do.',
  NOT_FOUND_ANYMORE: 'We could not find that. It may have been removed. Nothing else was affected.',
  LINKED: 'This is still connected to something else, so we kept it safe. Remove the connected item first, then try again.',
  TOO_LONG: 'One of the texts is a little long. Please shorten it a bit and you are good to go.',
  TRY_AGAIN: 'Something else was updating this at the same moment. Nothing is lost, just try once more.',
  BAD_INPUT: 'Something in the details needs a quick look. Please check them and try again, you are almost there.',
  UNREADABLE: 'We could not read that request. Nothing was changed. Please close and reopen the app, then try again.',
  SESSION_ENDED: 'For your safety we signed you out. Please sign in again, your data is exactly as you left it.',
  NOT_AVAILABLE: 'This is not available just yet. Nothing is wrong with your account. Please try another way.',
  RECEIPT_FAILED: 'That receipt was hard to read, and that is okay. Try a clearer photo, or just type the details yourself.',
} as const;
export type FriendlyCode = keyof typeof SAY;

/** Messages that were written for developers, by what they say. The first match wins. */
const REWRITE: Array<[RegExp, FriendlyCode]> = [
  [/not (configured|set up) on the server/i, 'NOT_AVAILABLE'],
  [/^(invalid|expired)( or expired)? (refresh )?token$/i, 'SESSION_ENDED'],
  [/^invalid refresh token$/i, 'SESSION_ENDED'],
  [/^client not found$/i, 'SESSION_ENDED'],
  [/^refresh token required$/i, 'SESSION_ENDED'],
  [/prisma|invalid `|unique constraint|foreign key|\bP20\d\d\b|ECONN|ETIMEDOUT|socket hang up|cannot read prop|is not a function|undefined|stack|SQL|Unexpected token/i, 'SERVER_ERROR'],
  [/^(ThrottlerException|Too Many Requests)/i, 'TOO_MANY_REQUESTS'],
  [/^(file too large|request entity too large|payload too large)/i, 'FILE_TOO_LARGE'],
  [/^failed to /i, 'SERVER_ERROR'],
  [/^unknown action$/i, 'BAD_INPUT'],
];

const asText = (v: unknown): string => (Array.isArray(v) ? v.map(String).join(' ') : typeof v === 'string' ? v : '');

function prismaCode(e: any): string | null {
  const name = String(e?.name ?? '');
  if (/^PrismaClient/.test(name) || /^P\d{4}$/.test(String(e?.code ?? ''))) return String(e?.code ?? name);
  return null;
}

/** Turns anything that was thrown into the answer to send. */
export function toFriendly(e: any): Friendly {
  // The database.
  const pc = prismaCode(e);
  if (pc) {
    const map: Record<string, [number, FriendlyCode]> = {
      P2002: [409, 'ALREADY_EXISTS'], P2025: [404, 'NOT_FOUND_ANYMORE'], P2003: [409, 'LINKED'], P2014: [409, 'LINKED'],
      P2000: [400, 'TOO_LONG'], P2034: [409, 'TRY_AGAIN'], P2024: [503, 'SERVICE_BUSY'], P1001: [503, 'SERVICE_BUSY'], P1002: [503, 'SERVICE_BUSY'], P1008: [503, 'SERVICE_BUSY'], P1017: [503, 'SERVICE_BUSY'],
      PrismaClientValidationError: [400, 'BAD_INPUT'], PrismaClientInitializationError: [503, 'SERVICE_BUSY'],
    };
    const [status, code] = map[pc] ?? (e?.name === 'PrismaClientValidationError' ? map.PrismaClientValidationError : e?.name === 'PrismaClientInitializationError' ? map.PrismaClientInitializationError : [500, 'SERVER_ERROR' as FriendlyCode]);
    return { status, body: { statusCode: status, message: SAY[code], code }, log: status >= 500 || code === 'BAD_INPUT' };
  }

  // Uploads that are too big, and requests the server could not read.
  if (e?.name === 'MulterError' || e?.code === 'LIMIT_FILE_SIZE') return { status: 413, body: { statusCode: 413, message: SAY.FILE_TOO_LARGE, code: 'FILE_TOO_LARGE' }, log: false };
  if (e?.type === 'entity.too.large') return { status: 413, body: { statusCode: 413, message: SAY.FILE_TOO_LARGE, code: 'FILE_TOO_LARGE' }, log: false };
  if (e?.type === 'entity.parse.failed' || (e instanceof SyntaxError && 'body' in (e as object))) return { status: 400, body: { statusCode: 400, message: SAY.UNREADABLE, code: 'UNREADABLE' }, log: false };

  // Errors the code raised on purpose.
  if (e instanceof HttpException) {
    const status = e.getStatus();
    const raw = e.getResponse();
    const body: Record<string, unknown> = typeof raw === 'object' && raw ? { ...(raw as Record<string, unknown>) } : { message: String(raw) };
    const text = asText(body.message) || e.message;
    if (status === 429) return { status, body: { ...body, statusCode: status, message: SAY.TOO_MANY_REQUESTS, code: 'TOO_MANY_REQUESTS' }, log: false };
    if (status === 413) return { status, body: { ...body, statusCode: status, message: SAY.FILE_TOO_LARGE, code: 'FILE_TOO_LARGE' }, log: false };
    // A coded error was written on purpose (for example a receipt that could not be read): its sentence stays.
    if (status >= 500 && !body.code) return { status, body: { statusCode: status, message: SAY.SERVER_ERROR, code: 'SERVER_ERROR' }, log: true };
    // A message written for people stays as it is, unless it reads like something for developers.
    const hit = REWRITE.find(([re]) => re.test(text));
    if (hit && !body.code) return { status, body: { ...body, statusCode: status, message: SAY[hit[1]], code: hit[1] }, log: hit[1] === 'SERVER_ERROR' };
    return { status, body: { ...body, statusCode: status, message: text || SAY.BAD_INPUT }, log: false };
  }

  // Anything else is our mistake.
  return { status: 500, body: { statusCode: 500, message: SAY.SERVER_ERROR, code: 'SERVER_ERROR' }, log: true };
}
