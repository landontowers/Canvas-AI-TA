import { IdentityPort, AuthUserContext, resolveTutorRole } from '@ai-tutor/core';

export interface DemoPersonaRecord {
  id: string;
  name: string;
  canvasUserId: string;
  roles: string[];
}

export class FakeIdentityAdapter implements IdentityPort {
  private personas: Record<string, DemoPersonaRecord> = {
    demo_student: {
      id: 'demo_student',
      name: 'Demo Student (Alex)',
      canvasUserId: '1001',
      roles: ['Learner', 'StudentEnrollment'],
    },
    demo_instructor: {
      id: 'demo_instructor',
      name: 'Demo Instructor (Prof. Martinez)',
      canvasUserId: '2001',
      roles: ['Instructor', 'TeacherEnrollment'],
    },
    demo_ta: {
      id: 'demo_ta',
      name: 'Demo TA (Jordan)',
      canvasUserId: '3001',
      roles: ['TeachingAssistant', 'TaEnrollment'],
    },
  };

  async resolveIdentity(params: {
    token?: string;
    personaId?: string;
    courseId?: string;
  }): Promise<AuthUserContext> {
    const personaKey = params.personaId || 'demo_student';
    const persona = this.personas[personaKey];

    if (!persona) {
      throw new Error(`Unauthorized: Persona '${personaKey}' is not on the demo allowlist.`);
    }

    const roles = persona.roles;
    const tutorRole = resolveTutorRole(roles);

    return {
      userId: `user-${persona.canvasUserId}`,
      canvasUserId: persona.canvasUserId,
      collegeId: 'sdi',
      courseId: params.courseId || 'sdi-ftt101',
      roles,
      tutorRole,
    };
  }
}
