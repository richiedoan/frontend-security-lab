import { canEditDocument, canReadDocument, canViewAudit } from './authorization-policy';
import { LAB_DOCUMENTS, LAB_USERS, type LabDocument, type LabUser } from './lab-data';

interface DocumentPolicyCase {
  name: string;
  user: LabUser;
  document: LabDocument;
  expected: boolean;
}

describe('authorization policy', () => {
  describe.each<{
    policyName: string;
    policy: (user: LabUser, document: LabDocument) => boolean;
    cases: DocumentPolicyCase[];
  }>([
    {
      policyName: 'canReadDocument',
      policy: canReadDocument,
      cases: [
        { name: 'owner', user: LAB_USERS.alice, document: LAB_DOCUMENTS['alice-plan'], expected: true },
        { name: 'non-owner', user: LAB_USERS.alice, document: LAB_DOCUMENTS['bob-notes'], expected: false },
        { name: 'editor', user: LAB_USERS.bob, document: LAB_DOCUMENTS['alice-plan'], expected: true },
        { name: 'viewer', user: LAB_USERS.bob, document: LAB_DOCUMENTS['alice-notes'], expected: true },
        { name: 'admin', user: LAB_USERS.admin, document: LAB_DOCUMENTS['bob-notes'], expected: true },
      ],
    },
    {
      policyName: 'canEditDocument',
      policy: canEditDocument,
      cases: [
        { name: 'owner', user: LAB_USERS.alice, document: LAB_DOCUMENTS['alice-plan'], expected: true },
        { name: 'non-owner', user: LAB_USERS.alice, document: LAB_DOCUMENTS['bob-notes'], expected: false },
        { name: 'editor', user: LAB_USERS.bob, document: LAB_DOCUMENTS['alice-plan'], expected: true },
        { name: 'viewer', user: LAB_USERS.bob, document: LAB_DOCUMENTS['alice-notes'], expected: false },
        { name: 'admin', user: LAB_USERS.admin, document: LAB_DOCUMENTS['bob-notes'], expected: true },
      ],
    },
  ])('$policyName', ({ policy, cases }) => {
    it.each(cases)('$name returns $expected', ({ user, document, expected }) => {
      expect(policy(user, document)).toBe(expected);
    });
  });

  it.each([
    { name: 'alice', user: LAB_USERS.alice, expected: false },
    { name: 'bob', user: LAB_USERS.bob, expected: false },
    { name: 'admin', user: LAB_USERS.admin, expected: true },
  ])('canViewAudit: $name returns $expected', ({ user, expected }) => {
    expect(canViewAudit(user)).toBe(expected);
  });
});
