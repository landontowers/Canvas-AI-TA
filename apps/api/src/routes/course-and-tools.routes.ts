import { FastifyInstance } from 'fastify';
import {
  ToolRegistry,
  UnauthorizedToolError,
  LmsPort,
  IdentityPort,
  PersistencePort,
  CalculatorPort,
} from '@virtual-ta/core';
import { AuthGuard } from '../auth-guard.js';
import { ToolExecuteBodySchema, CourseSettingsPutBodySchema } from '../schemas.js';

export interface CourseAndToolsRoutesDeps {
  ports: {
    lms: LmsPort;
    identity: IdentityPort;
    persistence: PersistencePort;
    calculator: CalculatorPort;
  };
  toolRegistry: ToolRegistry;
  authGuard: AuthGuard;
}

export function registerCourseAndToolsRoutes(
  server: FastifyInstance,
  deps: CourseAndToolsRoutesDeps,
): void {
  const { ports, toolRegistry, authGuard } = deps;

  server.get('/api/tools', async (request, reply) => {
    const query = request.query as { personaId?: string; courseId?: string };
    const token = authGuard.extractBearerToken(request);
    try {
      const authContext = await ports.identity.resolveIdentity({
        token,
        personaId: query.personaId || 'demo_student',
        courseId: query.courseId,
      });

      const tools = toolRegistry.getToolsForRole(authContext.assistantRole);
      return {
        role: authContext.assistantRole,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          requiredRole: t.requiredRole,
        })),
      };
    } catch (err: unknown) {
      reply.status(403);
      return {
        error: 'Forbidden',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  server.post('/api/tools/execute', async (request, reply) => {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const parsedBody = ToolExecuteBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      reply.status(400);
      return {
        error: 'Bad Request',
        message: parsedBody.error.issues.map((i) => i.message).join('; '),
      };
    }

    const body = parsedBody.data;
    const token = authGuard.extractBearerToken(request);
    const authContext = await ports.identity.resolveIdentity({
      token,
      personaId: body.personaId || 'demo_student',
      courseId: body.courseId,
    });

    try {
      const result = await toolRegistry.execute(
        {
          id: `call_${Date.now()}`,
          name: body.toolName,
          args: body.args || {},
        },
        {
          userId: authContext.userId,
          canvasUserId: authContext.canvasUserId,
          courseId: authContext.courseId,
          role: authContext.assistantRole,
          ports: {
            lms: ports.lms,
            calculator: ports.calculator,
          },
        },
      );

      return result;
    } catch (err: unknown) {
      if (err instanceof UnauthorizedToolError) {
        reply.status(403);
        return {
          error: 'Forbidden',
          message: err.message,
        };
      }
      reply.status(500);
      return {
        error: 'InternalServerError',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  server.get('/api/courses/:courseId/settings', async (request) => {
    const { courseId } = request.params as { courseId: string };
    return ports.persistence.getCourseSettings(courseId);
  });

  server.put('/api/courses/:courseId/settings', async (request, reply) => {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const parsedBody = CourseSettingsPutBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      reply.status(400);
      return {
        error: 'Bad Request',
        message: parsedBody.error.issues.map((i) => i.message).join('; '),
      };
    }

    const { courseId } = request.params as { courseId: string };
    const personaId = authGuard.extractPersonaId(request, parsedBody.data.personaId);
    const token = authGuard.extractBearerToken(request);

    try {
      const auth = await ports.identity.resolveIdentity({ token, personaId, courseId });
      if (auth.assistantRole !== 'instructor') {
        reply.status(403);
        return {
          error: 'Forbidden',
          message: 'Only course instructors or teaching assistants may modify course settings.',
        };
      }
    } catch (err: unknown) {
      reply.status(403);
      return {
        error: 'Forbidden',
        message: err instanceof Error ? err.message : String(err),
      };
    }

    return ports.persistence.updateCourseSettings(courseId, parsedBody.data.setting);
  });
}
