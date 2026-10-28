import { Controller, ForbiddenException, Get, Header, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { OidcGuard, type OidcRequest } from './oidc.guard';

// Stable seed subject IDs, independent of usernames and the earlier lab's data.
export const OIDC_DOCUMENTS = [
  { id: 'alice-notes', ownerSubject: '00000000-0000-4000-8000-000000000001', title: 'Alice OIDC notes' },
  { id: 'bob-notes', ownerSubject: '00000000-0000-4000-8000-000000000002', title: 'Bob OIDC notes' },
] as const;

@Controller('oidc')
@UseGuards(OidcGuard)
export class OidcController {
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@Req() request: OidcRequest) { return request.oidcPrincipal; }

  @Get('documents/:id')
  @Header('Cache-Control', 'no-store')
  document(@Param('id') id: string, @Req() request: OidcRequest) {
    const principal = request.oidcPrincipal;
    if (!principal.scopes.includes('documents:read') || !principal.roles.includes('user')) {
      throw new ForbiddenException('Document read scope and user role required');
    }
    const document = OIDC_DOCUMENTS.find(item => item.id === id);
    if (!document) throw new NotFoundException('Document not found');
    // No admin ownership bypass, and no username/client-supplied owner mapping.
    if (document.ownerSubject !== principal.subject) throw new ForbiddenException('Owner required');
    return document;
  }

  @Get('admin/audit')
  @Header('Cache-Control', 'no-store')
  audit(@Req() request: OidcRequest) {
    if (!request.oidcPrincipal.roles.includes('admin')) throw new ForbiddenException('Admin role required');
    return { message: 'OIDC lab audit', subject: request.oidcPrincipal.subject };
  }
}
