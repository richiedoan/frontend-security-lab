import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { INSECURE_CSRF } from './csrf-mode';
import type { LabSessionRequest } from './request-types';

export const TRUSTED_ORIGIN = 'http://localhost:3000';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(INSECURE_CSRF) private readonly insecure: boolean) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<LabSessionRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    // This exact mutation authenticates only with a verified bearer token in its
    // controller guards. Ambient cookies never authorize it. Browser origins,
    // when supplied, must still match; BFF server calls have no Origin header.
    if (request.method === 'PATCH' && /^\/token\/documents\/[a-z0-9][a-z0-9-]{0,63}$/.test(request.path)) {
      if (request.get('origin')) this.validateOrigin(request);
      return true;
    }
    // Token endpoints do not use ambient session cookies. Browser callers still
    // need a trusted Origin; local CLI callers may omit it. No broad CSRF bypass.
    if (request.method === 'POST' && ['/token/login', '/token/refresh', '/token/logout'].includes(request.path)) {
      if (request.get('origin')) this.validateOrigin(request);
      return true;
    }
    // Login establishes a new session: enforce Origin before replacing any session.
    if (request.method === 'POST' && request.path === '/session/login') {
      this.validateOrigin(request);
      return true;
    }
    if (!request.session?.userId) throw new UnauthorizedException('Authentication required');
    // Only the explicit local theme exercise bypasses CSRF, never authentication.
    if (this.insecure && request.method === 'POST' && request.path === '/profile/theme') return true;
    this.validateOrigin(request);
    const token = request.get('x-csrf-token');
    const expected = request.session.csrfToken;
    if (!token || !expected || expected.length !== 64 || token.length !== 64 || !/^[a-f0-9]{64}$/.test(token)
      || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      throw new ForbiddenException('Invalid CSRF token');
    }
    return true;
  }

  private validateOrigin(request: LabSessionRequest): void {
    if (request.get('origin') !== TRUSTED_ORIGIN) throw new ForbiddenException('Untrusted Origin');
  }
}
