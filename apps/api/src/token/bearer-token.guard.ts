import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { jwtVerify } from 'jose';
import type { KeyObject } from 'node:crypto';
import { TOKEN_ALGORITHM, TOKEN_PUBLIC_KEY } from './token-key';
import { ACCESS_TOKEN_SECONDS, TOKEN_AUDIENCE, TOKEN_ISSUER } from './token.service';

export interface VerifiedTokenPrincipal {
  readonly subject: string;
  readonly scope: string;
  readonly role: string;
}
export interface BearerRequest extends Request {
  tokenPrincipal: VerifiedTokenPrincipal;
}

@Injectable()
export class BearerTokenGuard implements CanActivate {
  constructor(@Inject(TOKEN_PUBLIC_KEY) private readonly getPublicKey: () => Promise<KeyObject>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BearerRequest>();
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(
      request.get('authorization') ?? '',
    );
    if (!match) throw new UnauthorizedException('Bearer access token required');
    const key = await this.getPublicKey();
    try {
      // Trust only the configured local public key, never token-provided keys/URLs.
      // jwtVerify checks signature and exp/nbf; requiredClaims also rejects omissions.
      const { payload } = await jwtVerify(match[1], key, {
        algorithms: [TOKEN_ALGORITHM],
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        typ: 'JWT',
        requiredClaims: ['iss', 'aud', 'sub', 'exp', 'iat', 'scope', 'role', 'jti'],
        maxTokenAge: ACCESS_TOKEN_SECONDS,
        clockTolerance: 0,
      });
      if (typeof payload.sub !== 'string' || !payload.sub.trim() ||
        typeof payload.jti !== 'string' || !payload.jti.trim() ||
        typeof payload.scope !== 'string' || typeof payload.role !== 'string' || !payload.role.trim() ||
        !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
        payload.exp! <= payload.iat! || payload.exp! - payload.iat! > ACCESS_TOKEN_SECONDS ||
        (payload.nbf !== undefined && !Number.isSafeInteger(payload.nbf))) {
        throw new UnauthorizedException('Invalid access token');
      }
      // Populate only AFTER verification. No frontend-decoded claims, cookies, or query inputs.
      request.tokenPrincipal = { subject: payload.sub, scope: payload.scope, role: payload.role };
      return true;
    } catch {
      // Do not log tokens or include library errors/payloads in the response.
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
