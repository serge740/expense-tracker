import { CanActivate, ExecutionContext, Injectable, InternalServerErrorException, createParamDecorator } from '@nestjs/common';
import { ScopeService } from './scope.service';
import { Scope } from './scope';

export const FAMILY_HEADER = 'x-family-id';

/**
 * Works out the scope of the request after the login guard has run, and stores it on the request. Use it as
 * `@UseGuards(ClientJwtAuthGuard, ScopeGuard)` on any controller that touches wallets, transactions or budgets.
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly scopes: ScopeService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (!req.client?.id) throw new InternalServerErrorException('ScopeGuard must run after the login guard');
    req.scope = await this.scopes.resolve(req.client.id, req.headers?.[FAMILY_HEADER]);
    return true;
  }
}

/** The request's scope. If the guard was forgotten this fails loudly instead of quietly acting as Personal. */
export const ReqScope = createParamDecorator((_data: unknown, ctx: ExecutionContext): Scope => {
  const scope = ctx.switchToHttp().getRequest().scope as Scope | undefined;
  if (!scope) throw new InternalServerErrorException('This route is missing ScopeGuard');
  return scope;
});
