import type { LabDocument, LabUser } from './lab-data';

export function canReadDocument(user: LabUser, document: LabDocument): boolean {
  return canEditDocument(user, document) || document.viewerIds.includes(user.id);
}

export function canEditDocument(user: LabUser, document: LabDocument): boolean {
  return user.role === 'admin' || document.ownerId === user.id || document.editorIds.includes(user.id);
}

export function canViewAudit(user: LabUser): boolean {
  return user.role === 'admin';
}
