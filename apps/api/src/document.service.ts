import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { canEditDocument, canReadDocument, canViewAudit } from './authorization-policy';
import { INSECURE_AUTHZ_MODE } from './authz-mode';
import {
  LAB_DOCUMENTS,
  type LabDocument,
  type LabDocumentId,
  type LabUser,
  type LabUserId,
} from './lab-data';

export interface AuditEvent {
  readonly action: 'document.title.updated';
  readonly actorId: LabUserId;
  readonly documentId: LabDocumentId;
}

@Injectable()
export class DocumentService {
  private readonly documents = new Map<LabDocumentId, LabDocument>(
    Object.values(LAB_DOCUMENTS).map((document) => [document.id, { ...document }]),
  );
  private readonly auditEvents: AuditEvent[] = [];

  constructor(@Inject(INSECURE_AUTHZ_MODE) private readonly insecureAuthzMode: boolean) {}

  getDocument(user: LabUser, id: string): LabDocument {
    const document = this.findDocument(id);
    // LOCAL LAB ONLY: this branch intentionally demonstrates an IDOR read.
    if (!this.insecureAuthzMode && !canReadDocument(user, document)) {
      throw new ForbiddenException('Document access denied');
    }
    return document;
  }

  updateDocument(user: LabUser, id: string, title: string): LabDocument {
    const document = this.findDocument(id);
    if (!canEditDocument(user, document)) {
      throw new ForbiddenException('Document edit denied');
    }

    const updated = { ...document, title };
    this.documents.set(document.id, updated);
    this.auditEvents.push({
      action: 'document.title.updated',
      actorId: user.id,
      documentId: document.id,
    });
    return updated;
  }

  getAudit(user: LabUser): readonly AuditEvent[] {
    if (!canViewAudit(user)) {
      throw new ForbiddenException('Audit access denied');
    }
    return [...this.auditEvents];
  }

  private findDocument(id: string): LabDocument {
    const document = this.documents.get(id as LabDocumentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return document;
  }
}
