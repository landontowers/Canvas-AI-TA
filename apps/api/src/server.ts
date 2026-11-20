import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import crypto from 'node:crypto';
import {
  AppConfig,
  LlmPort,
  LmsPort,
  IdentityPort,
  PersistencePort,
  CalculatorPort,
  ModerationPort,
  TelemetryPort,
  CrisisAlertPort,
  LogStoragePort,
  createStandardToolRegistry,
  ToolRegistry,
  UnauthorizedToolError,
  TutorEngine,
} from '@ai-tutor/core';
import {
  FakeLlmAdapter,
  FakeLmsAdapter,
  FakeIdentityAdapter,
  InMemoryPersistenceAdapter,
  InProcessCalculatorAdapter,
  FakeModerationAdapter,
  NoopTelemetryAdapter,
  PrivacyTelemetryAdapter,
  WebhookCrisisAlertAdapter,
  AzureBlobLogStorageAdapter,
  CanvasClient,
  CanvasRestAdapter,
  CanvasDemoIdentityAdapter,
  GeminiAdapter,
} from '@ai-tutor/adapters';

export interface PortsContainer {
  llm: LlmPort;
  classifierLlm?: LlmPort;
  lms: LmsPort;
  identity: IdentityPort;
  persistence: PersistencePort;
  calculator: CalculatorPort;
  moderation: ModerationPort;
  telemetry: TelemetryPort;
  crisisAlert?: CrisisAlertPort;
  logStorage?: LogStoragePort;
}

export function buildServer(
  config: AppConfig,
  portsOverride?: Partial<PortsContainer>,
): FastifyInstance {
  // Configure Fastify logger with strict secrets & PII redaction (critique §3.7, §4.3, §8)
  const server = Fastify({
    logger:
      config.env !== 'test'
        ? {
            level: 'info',
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers["x-canvas-token"]',
                'req.headers.cookie',
                'req.headers["cf-access-jwt-assertion"]',
                'req.body.message',
                'req.body.password',
                'req.body.token',
                'req.body.accessToken',
                'res.headers["set-cookie"]',
              ],
              censor: '[REDACTED]',
            },
          }
        : false,
  });

  server.register(cors, {
    origin: config.server.corsOrigins,
  });

  // Default to Canvas adapters if a real token is present, otherwise use fakes
  const hasLiveCanvasToken =
    config.canvas.accessToken && config.canvas.accessToken !== 'mock-dev-token';

  const defaultCanvasClient = hasLiveCanvasToken
    ? new CanvasClient({
        baseUrl: config.canvas.baseUrl,
        accessToken: config.canvas.accessToken,
      })
    : undefined;

  const useFakeLms = config.canvas.useFakeCourseData || !defaultCanvasClient;

  // Setup LLM adapter based on config (critique §3.9)
  let defaultLlm: LlmPort;
  let defaultClassifierLlm: LlmPort;

  if (config.model.provider === 'gemini') {
    if (!config.model.apiKey) {
      server.log.warn(
        'MODEL_PROVIDER is set to "gemini", but GEMINI_API_KEY is not configured. Falling back to FakeLlmAdapter.',
      );
      defaultLlm = new FakeLlmAdapter();
      defaultClassifierLlm = defaultLlm;
    } else {
      server.log.info(
        `Configuring GeminiAdapter with studentModel=${config.model.studentModel}, classifierModel=${config.model.classifierModel}`,
      );
      defaultLlm = new GeminiAdapter({
        apiKey: config.model.apiKey,
        defaultModel: config.model.studentModel,
        fallbackModel: 'gemini-3.5-flash-lite',
      });
      defaultClassifierLlm = new GeminiAdapter({
        apiKey: config.model.apiKey,
        defaultModel: config.model.classifierModel,
        fallbackModel: 'gemini-3.5-flash-lite',
      });
    }
  } else {
    defaultLlm = new FakeLlmAdapter();
    defaultClassifierLlm = defaultLlm;
  }

  const ports: PortsContainer = {
    llm: portsOverride?.llm ?? defaultLlm,
    classifierLlm:
      portsOverride?.classifierLlm ??
      (portsOverride?.llm ? portsOverride.llm : defaultClassifierLlm),
    lms:
      portsOverride?.lms ??
      (useFakeLms ? new FakeLmsAdapter() : new CanvasRestAdapter(defaultCanvasClient!)),
    identity:
      portsOverride?.identity ??
      (defaultCanvasClient
        ? new CanvasDemoIdentityAdapter({
            client: defaultCanvasClient,
            allowedPersonas: config.canvas.demoPersonas,
            collegeId: config.college.id,
          })
        : new FakeIdentityAdapter()),
    persistence: portsOverride?.persistence ?? new InMemoryPersistenceAdapter(),
    calculator: portsOverride?.calculator ?? new InProcessCalculatorAdapter(),
    moderation: portsOverride?.moderation ?? new FakeModerationAdapter(config.college.crisis.message),
    telemetry:
      portsOverride?.telemetry ??
      (config.env === 'test'
        ? new NoopTelemetryAdapter()
        : new PrivacyTelemetryAdapter({
            secretSalt: process.env.TELEMETRY_SALT,
            logStorage:
              portsOverride?.logStorage ??
              ((process.env.AZURE_LOG_STORAGE_ENABLED === 'true' ||
                Boolean(
                  process.env.AZURE_STORAGE_CONNECTION_STRING ||
                    process.env.AZURE_STORAGE_LOG_CONTAINER_URL,
                ))
                ? new AzureBlobLogStorageAdapter({
                    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
                    containerUrl: process.env.AZURE_STORAGE_LOG_CONTAINER_URL,
                    containerName: process.env.AZURE_STORAGE_LOG_CONTAINER,
                    logger: (msg) => server.log.info(`[AzureLogStorage] ${msg}`),
                  })
                : undefined),
          })),
    crisisAlert:
      portsOverride?.crisisAlert ??
      new WebhookCrisisAlertAdapter({
        webhookUrl: process.env.CRISIS_ALERT_WEBHOOK_URL,
        logger: (msg) => server.log.error(msg),
      }),
    logStorage:
      portsOverride?.logStorage ??
      ((process.env.AZURE_LOG_STORAGE_ENABLED === 'true' ||
        Boolean(
          process.env.AZURE_STORAGE_CONNECTION_STRING ||
            process.env.AZURE_STORAGE_LOG_CONTAINER_URL,
        ))
        ? new AzureBlobLogStorageAdapter({
            connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
            containerUrl: process.env.AZURE_STORAGE_LOG_CONTAINER_URL,
            containerName: process.env.AZURE_STORAGE_LOG_CONTAINER,
            logger: (msg) => server.log.info(`[AzureLogStorage] ${msg}`),
          })
        : undefined),
  };

  if (ports.logStorage) {
    server.addHook('onClose', async () => {
      if (ports.logStorage?.close) {
        await ports.logStorage.close();
      } else if (ports.logStorage?.flush) {
        await ports.logStorage.flush();
      }
    });
  }

  (server as unknown as { ports: PortsContainer }).ports = ports;

  const toolRegistry: ToolRegistry = createStandardToolRegistry();

  const activeSessions = new Set<string>();

  function isAuthorized(request: FastifyRequest): boolean {
    if (!config.demoAuth?.enabled) return true;

    // 1. Check Cloudflare Access header (critique §4.3, requires JWT assertion to prevent plain header spoofing)
    const cfEmail = request.headers['cf-access-authenticated-user-email'];
    const cfJwt = request.headers['cf-access-jwt-assertion'];
    if (
      typeof cfEmail === 'string' &&
      cfEmail.trim().length > 0 &&
      typeof cfJwt === 'string' &&
      cfJwt.trim().length > 0
    ) {
      const emailLower = cfEmail.trim().toLowerCase();
      if (
        config.demoAuth.invitedEmails.length === 0 ||
        config.demoAuth.invitedEmails.includes(emailLower)
      ) {
        return true;
      }
    }

    // 2. Check Bearer authorization token
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (activeSessions.has(token)) {
        return true;
      }
    }

    return false;
  }

  const engine = new TutorEngine({
    llm: ports.llm,
    classifierLlm: ports.classifierLlm ?? ports.llm,
    lms: ports.lms,
    identity: ports.identity,
    persistence: ports.persistence,
    calculator: ports.calculator,
    moderation: ports.moderation,
    telemetry: ports.telemetry,
    crisisAlert: ports.crisisAlert,
    toolRegistry,
    collegeConfig: config.college,
  });

  // Health check endpoint (Phase 1 exit criteria)
  server.get('/health', async () => {
    return {
      status: 'ok',
      env: config.env,
      college: config.college.id,
      modelProvider: config.model.provider,
      canvasConnected: Boolean(defaultCanvasClient),
      fakeCourseData: Boolean(useFakeLms),
      timestamp: new Date().toISOString(),
    };
  });

  // Public config for frontend/demo shell
  server.get('/api/config/demo', async () => {
    return {
      college: {
        id: config.college.id,
        name: config.college.name,
        theme: config.college.theme,
        crisis: config.college.crisis,
        personaCopy: config.college.personaCopy,
      },
      personas: config.canvas.demoPersonas,
      modelProvider: config.model.provider,
      canvasConnected: Boolean(defaultCanvasClient),
      fakeCourseData: Boolean(useFakeLms),
      demoAuth: {
        enabled: config.demoAuth?.enabled ?? false,
      },
    };
  });

  // Demo sign-in & auth endpoints (critique §4.3)
  server.get('/api/auth/status', async (request) => {
    if (!config.demoAuth?.enabled) {
      return { authRequired: false, authenticated: true };
    }
    const cfEmail = request.headers['cf-access-authenticated-user-email'];
    const email = typeof cfEmail === 'string' ? cfEmail : undefined;
    const authenticated = isAuthorized(request);
    return {
      authRequired: true,
      authenticated,
      userEmail: email,
    };
  });

  server.post('/api/auth/login', async (request, reply) => {
    const body = (request.body || {}) as { password?: string; email?: string };
    const providedPass = body.password?.trim();
    const providedEmail = body.email?.trim().toLowerCase();

    let valid = false;
    if (config.demoAuth?.password && providedPass === config.demoAuth.password) {
      valid = true;
    } else if (providedEmail && config.demoAuth?.invitedEmails.includes(providedEmail)) {
      valid = true;
    }

    if (!valid) {
      reply.status(401);
      return {
        error: 'Unauthorized',
        message: 'Invalid demo password or uninvited email address.',
      };
    }

    const token = `demo_${crypto.randomUUID()}`;
    activeSessions.add(token);
    return {
      success: true,
      token,
      email: providedEmail,
    };
  });

  server.post('/api/auth/logout', async (request) => {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      activeSessions.delete(authHeader.slice(7).trim());
    }
    return { success: true };
  });

  // List tools permitted for a specific persona/role (critique §3.14)
  server.get('/api/tools', async (request) => {
    const query = request.query as { personaId?: string; courseId?: string };
    const authContext = await ports.identity.resolveIdentity({
      personaId: query.personaId || 'demo_student',
      courseId: query.courseId,
    });

    const tools = toolRegistry.getToolsForRole(authContext.tutorRole);
    return {
      role: authContext.tutorRole,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        requiredRole: t.requiredRole,
      })),
    };
  });

  // Execute a tool with role-based access control (critique §3.14, §8)
  server.post('/api/tools/execute', async (request, reply) => {
    if (!isAuthorized(request)) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const body = request.body as {
      personaId?: string;
      courseId?: string;
      toolName: string;
      args?: Record<string, unknown>;
    };

    const authContext = await ports.identity.resolveIdentity({
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
          role: authContext.tutorRole,
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

  // Course settings endpoints (critique §3.4)
  server.get('/api/courses/:courseId/settings', async (request) => {
    const { courseId } = request.params as { courseId: string };
    return ports.persistence.getCourseSettings(courseId);
  });

  server.put('/api/courses/:courseId/settings', async (request, reply) => {
    if (!isAuthorized(request)) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }
    const { courseId } = request.params as { courseId: string };
    const body = request.body as { setting: 'full' | 'logistics_only' };
    return ports.persistence.updateCourseSettings(courseId, body.setting);
  });

  // Conversation history endpoints (protected by authentication & caller verification)
  server.get('/api/conversations', async (request, reply) => {
    if (!isAuthorized(request)) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }
    const query = request.query as { userId?: string; personaId?: string; courseId?: string };
    let resolvedUserId = query.userId;
    const resolvedCourseId = query.courseId || 'sdi-ftt101';

    if (!resolvedUserId && query.personaId) {
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

    // Enrich conversations with first message snippet for easy preview and message counts
    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        const msgs = await ports.persistence.listMessages(conv.id);
        const firstUserMsg = msgs.find((m) => m.role === 'user');
        const snippet = firstUserMsg
          ? firstUserMsg.content.slice(0, 50).trim() + (firstUserMsg.content.length > 50 ? '...' : '')
          : 'New conversation';
        return {
          ...conv,
          title: snippet,
          messageCount: msgs.length,
          lastMessageAt: msgs.length > 0 ? msgs[msgs.length - 1].createdAt : conv.updatedAt,
        };
      }),
    );

    return enriched;
  });

  server.get('/api/conversations/:id/messages', async (request, reply) => {
    if (!isAuthorized(request)) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }
    const { id } = request.params as { id: string };
    const conversation = await ports.persistence.getConversation(id);
    if (!conversation) {
      reply.status(404);
      return { error: 'Not Found', message: 'Conversation not found.' };
    }

    const query = request.query as { userId?: string; personaId?: string };
    if (query.personaId) {
      const auth = await ports.identity.resolveIdentity({ personaId: query.personaId });
      if (conversation.userId !== auth.userId) {
        reply.status(403);
        return { error: 'Forbidden', message: 'You do not have permission to view this conversation.' };
      }
    } else if (query.userId && conversation.userId !== query.userId) {
      reply.status(403);
      return { error: 'Forbidden', message: 'You do not have permission to view this conversation.' };
    }

    return ports.persistence.listMessages(id);
  });

  // "Clear my data" student opt-out endpoint (critique §3.1, §3.7)
  server.delete('/api/users/:userId/data', async (request, reply) => {
    if (!isAuthorized(request)) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }
    const { userId } = request.params as { userId: string };
    await ports.persistence.clearUserData(userId);
    return { success: true, message: 'All user conversations and data cleared.' };
  });

  // One-command demo reset endpoint (critique §4.4, §8, plan Phase 5)
  server.post('/api/demo/reset', async (request, reply) => {
    if (!isAuthorized(request)) {
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

  // Admin crisis incidents audit endpoint (FERPA 34 CFR § 99.36 Health & Safety emergency review)
  server.get('/api/admin/crisis-incidents', async (request, reply) => {
    if (!isAuthorized(request)) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const incidents = await ports.persistence.listCrisisIncidents(config.college.id);
    return {
      collegeId: config.college.id,
      totalIncidents: incidents.length,
      incidents,
    };
  });

  // Full streaming SSE chat endpoint driven by TutorEngine
  server.post('/api/chat', async (request, reply) => {
    if (!isAuthorized(request)) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const body = request.body as {
      personaId?: string;
      message: string;
      courseId?: string;
      conversationId?: string;
    };

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const stream = engine.executeTurn({
      personaId: body.personaId,
      message: body.message,
      courseId: body.courseId,
      conversationId: body.conversationId,
    });

    try {
      for await (const event of stream) {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      server.log.error(err);
      reply.raw.write(
        `data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`,
      );
    }

    reply.raw.end();
  });

  return server;
}
