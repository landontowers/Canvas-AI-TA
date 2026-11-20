import {
  IdentityPort,
  AuthUserContext,
  resolveAssistantRole,
  DemoPersona,
} from '@virtual-ta/core';
import { CanvasClient } from './canvas-client.js';
import { CanvasEnrollmentSchema } from './canvas-schemas.js';

export interface CanvasDemoIdentityAdapterOptions {
  client: CanvasClient;
  allowedPersonas: DemoPersona[];
  collegeId?: string;
}

export class CanvasDemoIdentityAdapter implements IdentityPort {
  private client: CanvasClient;
  private personasMap: Map<string, DemoPersona>;
  private collegeId: string;

  constructor(options: CanvasDemoIdentityAdapterOptions) {
    this.client = options.client;
    this.collegeId = options.collegeId || 'sdi';
    this.personasMap = new Map(options.allowedPersonas.map((p) => [p.id, p]));
  }

  async resolveIdentity(params: {
    token?: string;
    personaId?: string;
    courseId?: string;
  }): Promise<AuthUserContext> {
    const personaKey = params.personaId || 'demo_student';
    const persona = this.personasMap.get(personaKey);

    // Hard security check: Masquerade only as an allowlist of test accounts (critique §4.4)
    if (!persona) {
      throw new Error(`Unauthorized: Persona '${personaKey}' is not on the demo allowlist.`);
    }

    const courseId = params.courseId || 'sdi-ftt101';
    let roles: string[] = [persona.role === 'instructor' ? 'Instructor' : 'Learner'];

    // If live Canvas client is available, attempt to query real course enrollments
    try {
      const enrollments = await this.client.getAllPages<unknown>(
        `/api/v1/courses/${courseId}/enrollments`,
        {
          asUserId: persona.canvasUserId,
          query: {
            'user_id': persona.canvasUserId,
          },
        },
      );

      const foundRoles: string[] = [];
      for (const item of enrollments) {
        const parsed = CanvasEnrollmentSchema.safeParse(item);
        if (parsed.success) {
          foundRoles.push(parsed.data.role || parsed.data.type);
        }
      }

      if (foundRoles.length > 0) {
        roles = foundRoles;
      }
    } catch {
      // In offline mode or when mock returns static data, fall back to persona config
    }

    // Role resolution settled via fixed rule (critique §3.14)
    const assistantRole = resolveAssistantRole(roles);

    return {
      userId: `user-${persona.canvasUserId}`,
      canvasUserId: persona.canvasUserId,
      collegeId: this.collegeId,
      courseId,
      roles,
      assistantRole,
    };
  }
}
