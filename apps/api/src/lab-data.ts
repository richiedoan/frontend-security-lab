export type LabUserId = 'alice' | 'bob' | 'admin';
export type LabUserRole = 'user' | 'admin';
export type LabDocumentId =
  | 'alice-plan'
  | 'alice-notes'
  | 'alice-private'
  | 'bob-notes'
  | 'admin-runbook';

export interface LabUser {
  readonly id: LabUserId;
  readonly displayName: string;
  readonly role: LabUserRole;
}

export interface LabDocument {
  readonly id: LabDocumentId;
  readonly title: string;
  readonly ownerId: LabUserId;
  readonly editorIds: readonly LabUserId[];
  readonly viewerIds: readonly LabUserId[];
}

export const LAB_USERS: Readonly<Record<LabUserId, LabUser>> = {
  alice: { id: 'alice', displayName: 'Alice', role: 'user' },
  bob: { id: 'bob', displayName: 'Bob', role: 'user' },
  admin: { id: 'admin', displayName: 'Lab Admin', role: 'admin' },
};

export const LAB_DOCUMENTS: Readonly<Record<LabDocumentId, LabDocument>> = {
  'alice-plan': {
    id: 'alice-plan',
    title: 'Alice project plan',
    ownerId: 'alice',
    editorIds: ['bob'],
    viewerIds: [],
  },
  'alice-notes': {
    id: 'alice-notes',
    title: 'Alice shared notes',
    ownerId: 'alice',
    editorIds: [],
    viewerIds: ['bob'],
  },
  'alice-private': {
    id: 'alice-private',
    title: 'Alice private draft',
    ownerId: 'alice',
    editorIds: [],
    viewerIds: [],
  },
  'bob-notes': {
    id: 'bob-notes',
    title: 'Bob private notes',
    ownerId: 'bob',
    editorIds: [],
    viewerIds: [],
  },
  'admin-runbook': {
    id: 'admin-runbook',
    title: 'Local lab runbook',
    ownerId: 'admin',
    editorIds: [],
    viewerIds: [],
  },
};
