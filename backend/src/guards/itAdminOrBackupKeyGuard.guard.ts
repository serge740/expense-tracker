import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { RequestWithITAdmin } from '../common/interfaces/it-admin.interface';

/**
 * Allows the request through if EITHER:
 *   - the standard ITAdmin cookie-JWT check passes (identical to ITAdminJwtAuthGuard), or
 *   - header `x-backup-api-key` matches process.env.BACKUP_SERVICE_API_KEY
 *     (constant-time comparison), used by the unattended Backup-auto service.
 *
 * When the API-key path is used, `request.isBackupServiceCall` is set to `true` so the handler
 * knows there is no ITAdmin JWT to read a name/id from. Mirrors mimi_project's
 * AdminOrBackupKeyGuard exactly, including why it's applied per-route rather than at the
 * controller class level: a class-level guard ANDs with a method-level one in Nest rather than
 * ORing them, so a class-level ITAdminJwtAuthGuard here would silently defeat this guard's whole
 * "cookie OR key" purpose and 401 every machine-to-machine call regardless of a correct key.
 */
@Injectable()
export class ITAdminOrBackupKeyGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithITAdmin>();

    const token = request.cookies?.['AccessITAdminToken'];
    if (token) {
      try {
        request.itAdmin = await this.jwtService.verifyAsync<{ id: string; email: string; name: string }>(token, {
          secret: process.env.JWT_IT_ADMIN_SECRET || 'secretkey',
        });
        return true;
      } catch {
        // fall through to try the backup API key
      }
    }

    const providedKey = request.headers?.['x-backup-api-key'];
    const expectedKey = process.env.BACKUP_SERVICE_API_KEY;

    if (typeof providedKey === 'string' && expectedKey) {
      const providedBuf = Buffer.from(providedKey);
      const expectedBuf = Buffer.from(expectedKey);

      if (providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf)) {
        request.isBackupServiceCall = true;
        return true;
      }
    }

    if (!token) throw new UnauthorizedException('IT Support access token missing');
    throw new UnauthorizedException('Invalid or expired IT Support token');
  }
}
