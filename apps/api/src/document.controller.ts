import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { DocumentService, type AuditEvent } from './document.service';
import type { LabDocument } from './lab-data';
import type { AuthenticatedRequest } from './request-types';
import { SessionAuthGuard } from './session-auth.guard';
import { UpdateDocumentDto } from './update-document.dto';

@Controller('documents')
@UseGuards(SessionAuthGuard)
export class DocumentController {
  constructor(private readonly documents: DocumentService) {}

  @Get(':id')
  getDocument(@Param('id') id: string, @Req() request: AuthenticatedRequest): LabDocument {
    return this.documents.getDocument(request.user, id);
  }

  @Patch(':id')
  updateDocument(
    @Param('id') id: string,
    @Body() update: UpdateDocumentDto,
    @Req() request: AuthenticatedRequest,
  ): LabDocument {
    return this.documents.updateDocument(request.user, id, update.title);
  }
}

@Controller('admin')
@UseGuards(SessionAuthGuard)
export class AdminController {
  constructor(private readonly documents: DocumentService) {}

  @Get('audit')
  getAudit(@Req() request: AuthenticatedRequest): { events: readonly AuditEvent[] } {
    return { events: this.documents.getAudit(request.user) };
  }
}
