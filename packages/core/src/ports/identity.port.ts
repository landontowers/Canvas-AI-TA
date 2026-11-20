import { AssistantRole } from '../types/role.js';

export interface AuthUserContext {
  userId: string;
  canvasUserId: string;
  collegeId: string;
  courseId: string;
  roles: string[];
  assistantRole: AssistantRole;
}

export interface IdentityPort {
  resolveIdentity(params: {
    token?: string;
    personaId?: string;
    courseId?: string;
  }): Promise<AuthUserContext>;
}
