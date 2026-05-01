import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { RequestWithClient } from '../common/interfaces/client.interface';

@Injectable()
export class ClientJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithClient>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Not authenticated');
    }

    try {
      const decoded = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_CLIENT_SECRET || 'client-secret',
      });
      request.client = decoded;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(req: Request): string | undefined {
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    return req.cookies?.['AccessClientToken'];
  }
}
