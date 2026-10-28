import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { OIDC_KEYS, verifyOidcToken, type OidcKeys, type OidcPrincipal } from './oidc-verifier';

export interface OidcRequest extends Request { oidcPrincipal: OidcPrincipal }

@Injectable()
export class OidcGuard implements CanActivate {
  constructor(@Inject(OIDC_KEYS) private readonly keys: OidcKeys) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OidcRequest>();
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(request.get('authorization') ?? '');
    if (!match) throw new UnauthorizedException('Bearer access token required');
    try {
      request.oidcPrincipal = await verifyOidcToken(match[1], await this.keys());
      return true;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
