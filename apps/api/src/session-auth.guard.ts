import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { LAB_USERS } from './lab-data';
import type { AuthenticatedRequest, LabSessionRequest } from './request-types';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<LabSessionRequest>();
    const userId = request.session.userId;
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    (request as AuthenticatedRequest).user = LAB_USERS[userId];
    return true;
  }
}
