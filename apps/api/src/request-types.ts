import type { Request } from 'express';
import type { LabUser, LabUserId } from './lab-data';

export type LabSessionRequest = Request & {
  session: Request['session'] & { userId?: LabUserId; csrfToken?: string };
};

export type AuthenticatedRequest = LabSessionRequest & {
  user: LabUser;
};
