import { FastifyInstance } from 'fastify';
import {
  ToolRegistry,
  UnauthorizedToolError,
  LlmPort,
  LmsPort,
  IdentityPort,
  PersistencePort,
  CalculatorPort,
  isBlackoutActive,
} from '@virtual-ta/core';
import { AuthGuard } from '../auth-guard.js';
import {
  ToolExecuteBodySchema,
  CourseSettingsPutBodySchema,
  PracticeCheckBodySchema,
} from '../schemas.js';

export interface CourseAndToolsRoutesDeps {
  ports: {
    llm: LlmPort;
    lms: LmsPort;
    identity: IdentityPort;
    persistence: PersistencePort;
    calculator: CalculatorPort;
  };
  toolRegistry: ToolRegistry;
  authGuard: AuthGuard;
}

export interface PracticeCard {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
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

    return ports.persistence.updateCourseSettings(courseId, parsedBody.data.setting, {
      blackoutStart:
        parsedBody.data.blackoutStart === null
          ? null
          : parsedBody.data.blackoutStart
            ? new Date(parsedBody.data.blackoutStart)
            : undefined,
      blackoutEnd:
        parsedBody.data.blackoutEnd === null
          ? null
          : parsedBody.data.blackoutEnd
            ? new Date(parsedBody.data.blackoutEnd)
            : undefined,
    });
  });

  server.get('/api/courses/:courseId/confusion-pulse', async (request, reply) => {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const { courseId } = request.params as { courseId: string };
    const personaId = authGuard.extractPersonaId(request);
    const token = authGuard.extractBearerToken(request);

    try {
      const auth = await ports.identity.resolveIdentity({ token, personaId, courseId });
      if (auth.assistantRole !== 'instructor') {
        reply.status(403);
        return {
          error: 'Forbidden',
          message: 'Only course instructors or teaching assistants may view class confusion insights.',
        };
      }
    } catch (err: unknown) {
      reply.status(403);
      return {
        error: 'Forbidden',
        message: err instanceof Error ? err.message : String(err),
      };
    }

    return ports.persistence.getConfusionPulse(courseId, 5);
  });

  server.post('/api/practice-check', async (request, reply) => {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const parsedBody = PracticeCheckBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      reply.status(400);
      return {
        error: 'Bad Request',
        message: parsedBody.error.issues.map((i) => i.message).join('; '),
      };
    }

    const courseId = parsedBody.data.courseId || 'sdi-ftt101';
    const personaId = authGuard.extractPersonaId(request, parsedBody.data.personaId);
    const token = authGuard.extractBearerToken(request);
    const auth = await ports.identity.resolveIdentity({ token, personaId, courseId });

    const settings = await ports.persistence.getCourseSettings(auth.courseId);
    if (
      auth.assistantRole === 'student' &&
      (settings.setting !== 'full' || isBlackoutActive(settings))
    ) {
      reply.status(403);
      return {
        error: 'Forbidden',
        message: 'Practice checks are only available when Full Virtual TA mode is active.',
      };
    }

    const modules = await ports.lms.getCourseModules(auth.courseId, auth.canvasUserId);
    const unlocked = modules.filter((m) => !m.isLocked);
    const topicLabel =
      parsedBody.data.topic?.trim() ||
      unlocked[0]?.name ||
      'Course Fundamentals';

    let cards: PracticeCard[] = [];
    try {
      const llmRes = await ports.llm.generate({
        systemPrompt:
          'Generate 2 concise multiple-choice self-check practice questions as a JSON array with fields: question (string), options (array of 3 short strings), correctIndex (0-2), explanation (1 sentence). Return ONLY valid JSON.',
        messages: [
          {
            role: 'user',
            content: `Topic: ${topicLabel}. Unlocked modules: ${unlocked.map((m) => m.name).join(', ') || 'General course review'}.`,
          },
        ],
        maxTokens: 500,
        temperature: 0.3,
      });

      const match = llmRes.text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as PracticeCard[];
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every(
            (c) =>
              typeof c.question === 'string' &&
              Array.isArray(c.options) &&
              typeof c.correctIndex === 'number' &&
              typeof c.explanation === 'string',
          )
        ) {
          cards = parsed.slice(0, 3);
        }
      }
    } catch {
      // Fallback to deterministic unlocked-module practice cards below
    }

    if (cards.length === 0) {
      const firstItem = unlocked[0]?.items[0]?.title || topicLabel;
      cards = [
        {
          question: `Which step should you verify first when reviewing "${firstItem}"?`,
          options: [
            'Check the core safety and prerequisite requirements in the module',
            'Skip directly to the final calculation without checking units',
            'Ignore assignment rubric constraints',
          ],
          correctIndex: 0,
          explanation:
            'Starting with core safety principles and module prerequisites ensures every downstream step stays accurate.',
        },
        {
          question: `What is the best way to check your understanding of "${topicLabel}" before submitting?`,
          options: [
            'Compare your reasoning step-by-step against the rubric criteria',
            'Memorize a single numerical example without checking assumptions',
            'Wait until after the due date to inspect the syllabus',
          ],
          correctIndex: 0,
          explanation:
            'Mapping your work against each rubric criterion reveals conceptual gaps early.',
        },
      ];
    }

    return {
      courseId: auth.courseId,
      topic: topicLabel,
      cards,
    };
  });
}
