import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { toFriendly } from './friendly-errors';

/** The last stop for every error: the person gets a clear sentence, and the real cause goes to the server log. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const out = toFriendly(exception);
    if (out.log) {
      const e = exception as { message?: string; stack?: string; code?: string };
      this.logger.error(`${req?.method} ${req?.originalUrl?.split('?')[0]} → ${out.status}: ${e?.code ? `[${e.code}] ` : ''}${e?.message ?? exception}`, e?.stack);
    }
    if (res.headersSent) return;
    res.status(out.status).json(out.body);
  }
}
