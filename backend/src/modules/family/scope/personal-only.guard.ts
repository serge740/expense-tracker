import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { FAMILY_HEADER } from './scope.guard';
import { errors } from '../family-errors';

/**
 * Loans and debts, scheduled transactions and reminders belong to a person, never to a family. These routes ignore the
 * family header, so without this guard an app that sent it by mistake would show personal data under a family banner.
 * With it, sending the header here fails loudly (400 PERSONAL_ONLY) instead.
 */
@Injectable()
export class PersonalOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const raw = context.switchToHttp().getRequest().headers?.[FAMILY_HEADER];
    const sent = Array.isArray(raw) ? raw.length > 0 : typeof raw === 'string' && raw.trim() !== '';
    if (sent) throw errors.personalOnly();
    return true;
  }
}
