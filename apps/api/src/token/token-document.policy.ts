import { ForbiddenException } from '@nestjs/common';
import type { LabDocument } from '../lab-data';
import type { VerifiedTokenPrincipal } from './bearer-token.guard';

// Authorization is separate from JWT authentication. A valid signature alone grants no access.
export function authorizeTokenDocumentRead(principal: VerifiedTokenPrincipal, document: LabDocument): void {
  if (!principal.scope.split(' ').includes('documents:read') ||
    !['user', 'admin'].includes(principal.role)) {
    throw new ForbiddenException('Document permission denied');
  }
  // This exercise is owner-only, including admins. No insecure-mode, editor, or viewer bypass.
  if (principal.subject !== document.ownerId) throw new ForbiddenException('Document ownership required');
}
