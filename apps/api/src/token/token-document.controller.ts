import { Body, Controller, ForbiddenException, Get, Header, NotFoundException, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { LAB_DOCUMENTS, type LabDocument, type LabDocumentId } from '../lab-data';
import { BearerTokenGuard, type BearerRequest } from './bearer-token.guard';
import { LocalTokenGuard } from './token.controller';
import { authorizeTokenDocumentRead } from './token-document.policy';
import { UpdateDocumentDto } from '../update-document.dto';

// Independent of the session/IDOR lab; authorization is always enforced here.
@Controller('token/documents')
@UseGuards(LocalTokenGuard, BearerTokenGuard)
export class TokenDocumentController {
  private readonly documents: Record<string, LabDocument> = structuredClone(LAB_DOCUMENTS);

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  getDocument(@Param('id') id: string, @Req() request: BearerRequest): LabDocument {
    if (!Object.hasOwn(this.documents, id)) throw new NotFoundException('Document not found');
    const document = this.documents[id as LabDocumentId];
    authorizeTokenDocumentRead(request.tokenPrincipal, document);
    return document;
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  updateDocument(@Param('id') id: string, @Body() update: UpdateDocumentDto, @Req() request: BearerRequest): LabDocument {
    const document = this.getDocument(id, request);
    if (!request.tokenPrincipal.scope.split(' ').includes('documents:write')) {
      throw new ForbiddenException('Document write scope required');
    }
    this.documents[id] = { ...document, title: update.title };
    return this.documents[id];
  }
}
