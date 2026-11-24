import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AppConfig,
  IdentityPort,
  PersistencePort,
  TelemetryPort,
  VirtualTaEngine,
  toClientStreamEvent,
} from '@virtual-ta/core';
import { AuthGuard } from '../auth-guard.js';
import { SlidingWindowRateLimiter } from '../rate-limiter.js';
import {
  ChatBodySchema,
  RetentionPurgeBodySchema,
  FeedbackBodySchema,
  CrisisStatusPatchBodySchema,
  UserLearningContextPutBodySchema,
} from '../schemas.js';

function extractHumanErrorMessage(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err);
  for (let i = 0; i < 4; i++) {
    const trimmed = msg.trim();
    if (!trimmed.startsWith('{')) break;
    try {
      const parsed = JSON.parse(trimmed) as {
        message?: unknown;
        error?: { message?: unknown } | string;
      };
      if (typeof parsed.error === 'object' && parsed.error !== null && typeof parsed.error.message === 'string') {
        msg = parsed.error.message;
        continue;
      }
      if (typeof parsed.error === 'string') {
        msg = parsed.error;
        continue;
      }
      if (typeof parsed.message === 'string') {
        msg = parsed.message;
        continue;
      }
    } catch {
      break;
    }
    break;
  }
  return msg.trim() || 'An unexpected error occurred. Please try again.';
}

export interface ConversationsAndAdminRoutesDeps {
  config: AppConfig;
  ports: {
    identity: IdentityPort;
    persistence: PersistencePort;
    telemetry: TelemetryPort;
  };
  engine: VirtualTaEngine;
  authGuard: AuthGuard;
  chatLimiter: SlidingWindowRateLimiter;
}

export function registerConversationsAndAdminRoutes(
  server: FastifyInstance,
  deps: ConversationsAndAdminRoutesDeps,
): void {
  const { config, ports, engine, authGuard, chatLimiter } = deps;

  server.get('/api/conversations', async (request, reply) => {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const query = request.query as { userId?: string; personaId?: string; courseId?: string };
    let resolvedUserId = query.userId;
    let resolvedCourseId = query.courseId || 'sdi-ftt101';
    const token = authGuard.extractBearerToken(request);

    if (token && token.startsWith('lti_')) {
      const auth = await ports.identity.resolveIdentity({ token, courseId: resolvedCourseId });
      resolvedUserId = auth.userId;
      resolvedCourseId = query.courseId || auth.courseId;
    } else if (!resolvedUserId && query.personaId) {
      const auth = await ports.identity.resolveIdentity({
        personaId: query.personaId,
        courseId: resolvedCourseId,
      });
      resolvedUserId = auth.userId;
    }

    if (!resolvedUserId) {
      reply.status(400);
      return { error: 'Bad Request', message: 'userId or personaId query parameter is required.' };
    }

    const conversations = await ports.persistence.listConversations(resolvedUserId, resolvedCourseId);

    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        if (conv.title !== undefined && conv.messageCount !== undefined) {
          return {
            ...conv,
            title: conv.title || 'New conversation',
            messageCount: conv.messageCount,
            lastMessageAt: conv.updatedAt,
          };
        }

        const msgs = await ports.persistence.listMessages(conv.id);
        const firstUserMsg = msgs.find((m) => m.role === 'user');
        const snippet = firstUserMsg
          ? firstUserMsg.content.slice(0, 50).trim() + (firstUserMsg.content.length > 50 ? '...' : '')
          : 'New conversation';
        return {
          ...conv,
          title: conv.title ?? snippet,
          messageCount: conv.messageCount ?? msgs.length,
          lastMessageAt: msgs.length > 0 ? msgs[msgs.length - 1].createdAt : conv.updatedAt,
        };
      }),
    );

    return enriched;
  });

  server.get('/api/conversations/:id/messages', async (request, reply) => {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }
    const { id } = request.params as { id: string };
    const conversation = await ports.persistence.getConversation(id);
    if (!conversation) {
      reply.status(404);
      return { error: 'Not Found', message: 'Conversation not found.' };
    }

    const token = authGuard.extractBearerToken(request);
    const query = request.query as { userId?: string; personaId?: string };

    let requesterUserId = query.userId;
    if (token && token.startsWith('lti_')) {
      const auth = await ports.identity.resolveIdentity({ token });
      requesterUserId = auth.userId;
    } else if (!query.personaId && !query.userId) {
      reply.status(400);
      return { error: 'Bad Request', message: 'personaId or userId query parameter is required.' };
    } else if (query.personaId) {
      const auth = await ports.identity.resolveIdentity({ personaId: query.personaId });
      requesterUserId = auth.userId;
    }

    if (conversation.userId !== requesterUserId) {
      reply.status(403);
      return { error: 'Forbidden', message: 'You do not have permission to view this conversation.' };
    }

    return ports.persistence.listMessages(id);
  });

  server.delete('/api/conversations/:id', async (request, reply) => {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const { id } = request.params as { id: string };
    const token = authGuard.extractBearerToken(request);
    const query = (request.query || {}) as { userId?: string; personaId?: string };

    let requesterUserId = query.userId;
    if (token && token.startsWith('lti_')) {
      const auth = await ports.identity.resolveIdentity({ token });
      requesterUserId = auth.userId;
    } else if (query.personaId || !requesterUserId) {
      const auth = await ports.identity.resolveIdentity({
        personaId: authGuard.extractPersonaId(request, query.personaId),
      });
      requesterUserId = auth.userId;
    }

    const deleted = await ports.persistence.deleteConversation(id, requesterUserId);
    if (!deleted) {
      reply.status(404);
      return { error: 'Not Found', message: 'Conversation not found or not owned by caller.' };
    }

    return { success: true, id };
  });

  server.post('/api/feedback', async (request, reply) => {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const parsedBody = FeedbackBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      reply.status(400);
      return {
        error: 'Bad Request',
        message: parsedBody.error.issues.map((i) => i.message).join('; '),
      };
    }

    const token = authGuard.extractBearerToken(request);
    const auth = await ports.identity.resolveIdentity({
      token,
      personaId: authGuard.extractPersonaId(request, parsedBody.data.personaId),
      courseId: parsedBody.data.courseId,
    });

    ports.telemetry.recordEvent('virtual_ta_feedback', {
      userId: auth.userId,
      courseId: auth.courseId,
      conversationId: parsedBody.data.conversationId,
      messageId: parsedBody.data.messageId,
      rating: parsedBody.data.rating,
    });

    return { success: true };
  });

  async function resolveAuthorizedSelfUserId(
    request: FastifyRequest,
    reply: FastifyReply,
    rawParamUserId: string,
  ): Promise<string | null> {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return null;
    }

    const token = authGuard.extractBearerToken(request);
    const query = (request.query || {}) as { personaId?: string };
    let targetUserId = rawParamUserId;

    if (token && token.startsWith('lti_')) {
      const auth = await ports.identity.resolveIdentity({ token });
      const matchesSelf =
        rawParamUserId === 'me' ||
        rawParamUserId === auth.userId ||
        rawParamUserId === query.personaId;
      if (!matchesSelf) {
        reply.status(403);
        return null;
      }
      targetUserId = auth.userId;
    } else if (query.personaId) {
      const auth = await ports.identity.resolveIdentity({ personaId: query.personaId });
      const matchesSelf =
        rawParamUserId === 'me' ||
        rawParamUserId === query.personaId ||
        rawParamUserId === auth.userId;
      if (!matchesSelf) {
        reply.status(403);
        return null;
      }
      targetUserId = auth.userId;
    } else if (rawParamUserId === 'me') {
      const auth = await ports.identity.resolveIdentity({
        personaId: authGuard.extractPersonaId(request),
      });
      targetUserId = auth.userId;
    } else if (
      config.canvas.demoPersonas.some((p) => p.id === rawParamUserId) ||
      rawParamUserId.startsWith('demo_')
    ) {
      const auth = await ports.identity.resolveIdentity({ personaId: rawParamUserId });
      targetUserId = auth.userId;
    }

    return targetUserId;
  }

  server.delete('/api/users/:userId/data', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const targetUserId = await resolveAuthorizedSelfUserId(request, reply, userId);
    if (!targetUserId) {
      return reply.statusCode === 401
        ? { error: 'Unauthorized', message: 'Demo authentication required.' }
        : { error: 'Forbidden', message: 'You may only delete your own conversation data.' };
    }

    const scope = ((request.query || {}) as { scope?: string }).scope || 'chats';
    if (scope === 'context') {
      await ports.persistence.clearUserLearningContext(targetUserId);
      return { success: true, scope, message: 'Personal learning context cleared.' };
    }
    if (scope === 'all') {
      await ports.persistence.clearUserData(targetUserId);
      await ports.persistence.clearUserLearningContext(targetUserId);
      return { success: true, scope, message: 'Previous chats and personal learning context cleared.' };
    }

    await ports.persistence.clearUserData(targetUserId);
    return { success: true, scope: 'chats', message: 'Previous chats cleared.' };
  });

  server.get('/api/users/:userId/context', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const targetUserId = await resolveAuthorizedSelfUserId(request, reply, userId);
    if (!targetUserId) {
      return reply.statusCode === 401
        ? { error: 'Unauthorized', message: 'Demo authentication required.' }
        : { error: 'Forbidden', message: 'You may only view your own learning context.' };
    }

    const ctx = await ports.persistence.getUserLearningContext(targetUserId);
    return (
      ctx ?? {
        userId: targetUserId,
        preferredStyle: null,
        recurringTopics: [],
        notes: null,
      }
    );
  });

  server.delete('/api/users/:userId/context', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const targetUserId = await resolveAuthorizedSelfUserId(request, reply, userId);
    if (!targetUserId) {
      return reply.statusCode === 401
        ? { error: 'Unauthorized', message: 'Demo authentication required.' }
        : { error: 'Forbidden', message: 'You may only delete your own learning context.' };
    }

    const cleared = await ports.persistence.clearUserLearningContext(targetUserId);
    return {
      success: true,
      cleared,
      message: 'Personal learning context cleared.',
    };
  });

  server.put('/api/users/:userId/context', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const targetUserId = await resolveAuthorizedSelfUserId(request, reply, userId);
    if (!targetUserId) {
      return reply.statusCode === 401
        ? { error: 'Unauthorized', message: 'Demo authentication required.' }
        : { error: 'Forbidden', message: 'You may only update your own learning context.' };
    }

    const parsedBody = UserLearningContextPutBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      reply.status(400);
      return {
        error: 'Bad Request',
        message: parsedBody.error.issues.map((i) => i.message).join('; '),
      };
    }

    const existing = await ports.persistence.getUserLearningContext(targetUserId);
    const saved = await ports.persistence.upsertUserLearningContext({
      userId: targetUserId,
      collegeId: existing?.collegeId || config.college.id,
      preferredStyle:
        parsedBody.data.preferredStyle === undefined
          ? existing?.preferredStyle
          : parsedBody.data.preferredStyle || undefined,
      recurringTopics:
        parsedBody.data.recurringTopics ?? existing?.recurringTopics ?? [],
      notes:
        parsedBody.data.notes === undefined
          ? existing?.notes
          : parsedBody.data.notes || undefined,
    });

    return saved;
  });

  server.post('/api/demo/reset', async (request, reply) => {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const body = (request.body || {}) as { courseId?: string };
    const courseId = body.courseId || 'sdi-ftt101';

    const persistenceAny = ports.persistence as unknown as {
      resetDemo?: (courseId: string) => Promise<void>;
    };
    if (typeof persistenceAny.resetDemo === 'function') {
      await persistenceAny.resetDemo(courseId);
    } else {
      await ports.persistence.updateCourseSettings(courseId, 'full');
    }

    return {
      success: true,
      courseId,
      setting: 'full',
      message: `Demo state reset: conversations cleared and course ${courseId} setting restored to 'full'.`,
    };
  });

  server.get('/api/admin/crisis-incidents', async (request, reply) => {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const personaId = authGuard.extractPersonaId(request);
    const token = authGuard.extractBearerToken(request);
    try {
      const auth = await ports.identity.resolveIdentity({ token, personaId });
      if (auth.assistantRole !== 'instructor') {
        reply.status(403);
        return {
          error: 'Forbidden',
          message: 'Course staff or administrator privileges are required to view crisis incidents.',
        };
      }
    } catch (err: unknown) {
      reply.status(403);
      return {
        error: 'Forbidden',
        message: err instanceof Error ? err.message : String(err),
      };
    }

    const incidents = await ports.persistence.listCrisisIncidents(config.college.id);
    return {
      collegeId: config.college.id,
      totalIncidents: incidents.length,
      incidents,
    };
  });

  server.patch('/api/admin/crisis-incidents/:id', async (request, reply) => {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const parsedBody = CrisisStatusPatchBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      reply.status(400);
      return {
        error: 'Bad Request',
        message: parsedBody.error.issues.map((i) => i.message).join('; '),
      };
    }

    const personaId = authGuard.extractPersonaId(request, parsedBody.data.personaId);
    const token = authGuard.extractBearerToken(request);
    let reviewerId = personaId;
    try {
      const auth = await ports.identity.resolveIdentity({ token, personaId });
      if (auth.assistantRole !== 'instructor') {
        reply.status(403);
        return {
          error: 'Forbidden',
          message: 'Course staff or administrator privileges are required to update crisis incidents.',
        };
      }
      reviewerId = auth.userId;
    } catch (err: unknown) {
      reply.status(403);
      return {
        error: 'Forbidden',
        message: err instanceof Error ? err.message : String(err),
      };
    }

    const { id } = request.params as { id: string };
    const updated = await ports.persistence.updateCrisisIncidentStatus(
      id,
      parsedBody.data.status,
      reviewerId,
    );
    if (!updated) {
      reply.status(404);
      return { error: 'Not Found', message: 'Crisis incident not found.' };
    }

    return { success: true, incident: updated };
  });

  server.post('/api/admin/retention/purge', async (request, reply) => {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const parsedBody = RetentionPurgeBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      reply.status(400);
      return {
        error: 'Bad Request',
        message: parsedBody.error.issues.map((i) => i.message).join('; '),
      };
    }

    const personaId = authGuard.extractPersonaId(request, parsedBody.data.personaId);
    const token = authGuard.extractBearerToken(request);
    try {
      const auth = await ports.identity.resolveIdentity({ token, personaId });
      if (auth.assistantRole !== 'instructor') {
        reply.status(403);
        return {
          error: 'Forbidden',
          message: 'Course staff or administrator privileges are required to purge expired conversations.',
        };
      }
    } catch (err: unknown) {
      reply.status(403);
      return {
        error: 'Forbidden',
        message: err instanceof Error ? err.message : String(err),
      };
    }

    const retentionDays = parsedBody.data.retentionDays ?? config.database.retentionDays;
    const result = await ports.persistence.purgeExpiredConversations(retentionDays);
    return {
      success: true,
      retentionDays,
      ...result,
    };
  });

  server.post('/api/chat', async (request, reply) => {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const rateCheck = chatLimiter.check(request.ip || 'unknown');
    if (!rateCheck.allowed) {
      reply.header('Retry-After', String(rateCheck.retryAfterSeconds));
      reply.status(429);
      return {
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Retry in ${rateCheck.retryAfterSeconds} seconds.`,
      };
    }

    const parsedBody = ChatBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      reply.status(400);
      return {
        error: 'Bad Request',
        message: parsedBody.error.issues.map((i) => i.message).join('; '),
      };
    }

    const body = parsedBody.data;
    const token = authGuard.extractBearerToken(request);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const stream = engine.executeTurn({
      token,
      personaId: body.personaId,
      message: body.message,
      courseId: body.courseId,
      conversationId: body.conversationId,
      pageContext: body.pageContext,
    });

    try {
      for await (const event of stream) {
        const sanitizedEvent = toClientStreamEvent(event);
        reply.raw.write(`data: ${JSON.stringify(sanitizedEvent)}\n\n`);
      }
    } catch (err: unknown) {
      const errMsg = extractHumanErrorMessage(err);
      server.log.error(err);
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`);
    }

    reply.raw.end();
  });
}
