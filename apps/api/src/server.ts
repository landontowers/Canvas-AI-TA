import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  AppConfig,
  CourseSettingValueSchema,
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
  toClientStreamEvent,
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
  createDrizzlePersistence,
} from '@ai-tutor/adapters';
import { CloudflareAccessVerifier } from './cf-access.js';
import { SlidingWindowRateLimiter } from './rate-limiter.js';

export interface PortsContainer {
  llm: LlmPort;
  instructorLlm?: LlmPort;
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

const LoginBodySchema = z
  .object({
    password: z.string().optional(),
    email: z.string().optional(),
  })
  .default({});

const ToolExecuteBodySchema = z.object({
  personaId: z.string().optional(),
  courseId: z.string().optional(),
  toolName: z.string().min(1),
  args: z.record(z.unknown()).optional(),
});

const CourseSettingsPutBodySchema = z.object({
  setting: CourseSettingValueSchema,
  personaId: z.string().optional(),
});

const ChatBodySchema = z.object({
  personaId: z.string().optional(),
  courseId: z.string().optional(),
  conversationId: z.string().optional(),
  message: z.string().trim().min(1, 'message is required').max(4000, 'message exceeds maximum length of 4000 characters'),
  pageContext: z
    .object({
      title: z.string().max(500).optional(),
      url: z.string().max(2000).optional(),
      content: z.string().max(8000).optional(),
    })
    .optional(),
});

function safeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
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

  // Security response headers across both Fastify JSON replies and raw SSE streams
  server.addHook('onRequest', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('X-Download-Options', 'noopen');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    reply.raw.setHeader('X-Content-Type-Options', 'nosniff');
    reply.raw.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.raw.setHeader('X-Download-Options', 'noopen');
    reply.raw.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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

  // Setup LLM adapters based on config (critique §3.9)
  let defaultLlm: LlmPort;
  let defaultInstructorLlm: LlmPort;
  let defaultClassifierLlm: LlmPort;

  if (config.model.provider === 'gemini') {
    if (!config.model.apiKey) {
      server.log.warn(
        'MODEL_PROVIDER is set to "gemini", but GEMINI_API_KEY is not configured. Falling back to FakeLlmAdapter.',
      );
      defaultLlm = new FakeLlmAdapter();
      defaultInstructorLlm = defaultLlm;
      defaultClassifierLlm = defaultLlm;
    } else {
      server.log.info(
        `Configuring GeminiAdapter with studentModel=${config.model.studentModel}, instructorModel=${config.model.instructorModel}, classifierModel=${config.model.classifierModel}`,
      );
      defaultLlm = new GeminiAdapter({
        apiKey: config.model.apiKey,
        defaultModel: config.model.studentModel,
        fallbackModel: 'gemini-3.5-flash-lite',
      });
      defaultInstructorLlm = new GeminiAdapter({
        apiKey: config.model.apiKey,
        defaultModel: config.model.instructorModel,
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
    defaultInstructorLlm = defaultLlm;
    defaultClassifierLlm = defaultLlm;
  }

  // Instantiate shared AzureBlobLogStorageAdapter once (avoids orphan un-flushed buffer)
  const shouldEnableAzureLogs =
    process.env.AZURE_LOG_STORAGE_ENABLED === 'true' ||
    Boolean(
      process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_STORAGE_LOG_CONTAINER_URL,
    );

  const resolvedLogStorage =
    portsOverride?.logStorage ??
    (shouldEnableAzureLogs
      ? new AzureBlobLogStorageAdapter({
          connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
          containerUrl: process.env.AZURE_STORAGE_LOG_CONTAINER_URL,
          containerName: process.env.AZURE_STORAGE_LOG_CONTAINER,
          logger: (msg) => server.log.info(`[AzureLogStorage] ${msg}`),
        })
      : undefined);

  // Wire persistence adapter (Drizzle/Postgres when configured, otherwise in-memory)
  let resolvedPersistence = portsOverride?.persistence;
  let closePersistence: (() => Promise<void>) | undefined;
  if (!resolvedPersistence) {
    if (config.database.persistenceMode === 'postgres') {
      const pg = createDrizzlePersistence(config.database.url);
      resolvedPersistence = pg.adapter;
      closePersistence = pg.close;
    } else {
      resolvedPersistence = new InMemoryPersistenceAdapter();
    }
  }

  const ports: PortsContainer = {
    llm: portsOverride?.llm ?? defaultLlm,
    instructorLlm:
      portsOverride?.instructorLlm ?? (portsOverride?.llm ? portsOverride.llm : defaultInstructorLlm),
    classifierLlm:
      portsOverride?.classifierLlm ?? (portsOverride?.llm ? portsOverride.llm : defaultClassifierLlm),
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
    persistence: resolvedPersistence,
    calculator: portsOverride?.calculator ?? new InProcessCalculatorAdapter(),
    moderation: portsOverride?.moderation ?? new FakeModerationAdapter(config.college.crisis.message),
    telemetry:
      portsOverride?.telemetry ??
      (config.env === 'test' && !resolvedLogStorage
        ? new NoopTelemetryAdapter()
        : new PrivacyTelemetryAdapter({
            secretSalt: process.env.TELEMETRY_SALT,
            enableStdout: config.env !== 'test',
            logStorage: resolvedLogStorage,
          })),
    crisisAlert:
      portsOverride?.crisisAlert ??
      new WebhookCrisisAlertAdapter({
        webhookUrl:
          config.crisisAlert?.webhookUrl ??
          process.env.CRISIS_ALERT_WEBHOOK_URL ??
          process.env.CRISIS_WEBHOOK_URL,
        bearerToken: config.crisisAlert?.bearerToken ?? process.env.CRISIS_ALERT_BEARER_TOKEN,
        logger: (msg) => server.log.error(msg),
      }),
    logStorage: resolvedLogStorage,
  };

  if (ports.logStorage || closePersistence) {
    server.addHook('onClose', async () => {
      if (ports.logStorage?.close) {
        await ports.logStorage.close();
      } else if (ports.logStorage?.flush) {
        await ports.logStorage.flush();
      }
      if (closePersistence) {
        await closePersistence();
      }
    });
  }

  (server as unknown as { ports: PortsContainer }).ports = ports;

  const toolRegistry: ToolRegistry = createStandardToolRegistry();
  const activeSessions = new Set<string>();

  const cfVerifier = new CloudflareAccessVerifier({
    teamDomain: config.demoAuth?.cfAccessTeamDomain,
    aud: config.demoAuth?.cfAccessAud,
    invitedEmails: config.demoAuth?.invitedEmails ?? [],
    allowUnverifiedInDev: config.env !== 'production',
  });

  const loginLimiter = new SlidingWindowRateLimiter({
    windowMs: 15 * 60_000,
    maxRequests: 10,
  });

  const chatLimiter = new SlidingWindowRateLimiter({
    windowMs: 60_000,
    maxRequests: 60,
  });

  async function isAuthorized(request: FastifyRequest): Promise<boolean> {
    if (!config.demoAuth?.enabled) return true;

    const cfEmail = request.headers['cf-access-authenticated-user-email'];
    const cfJwt = request.headers['cf-access-jwt-assertion'];
    if (await cfVerifier.verifyHeaders(cfEmail, cfJwt)) {
      return true;
    }

    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (activeSessions.has(token)) {
        return true;
      }
    }

    return false;
  }

  function extractPersonaId(request: FastifyRequest, bodyPersonaId?: string): string {
    const query = (request.query || {}) as { personaId?: string };
    const headerPersona = request.headers['x-persona-id'];
    if (bodyPersonaId && bodyPersonaId.trim()) return bodyPersonaId.trim();
    if (query.personaId && query.personaId.trim()) return query.personaId.trim();
    if (typeof headerPersona === 'string' && headerPersona.trim()) return headerPersona.trim();
    return 'demo_student';
  }

  const engine = new TutorEngine({
    llm: ports.llm,
    instructorLlm: ports.instructorLlm,
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
    canvasBaseUrl: config.canvas.baseUrl,
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
    const authenticated = await isAuthorized(request);
    return {
      authRequired: true,
      authenticated,
      userEmail: email,
    };
  });

  server.post('/api/auth/login', async (request, reply) => {
    const rateCheck = loginLimiter.check(request.ip || 'unknown');
    if (!rateCheck.allowed) {
      reply.header('Retry-After', String(rateCheck.retryAfterSeconds));
      reply.status(429);
      return {
        error: 'Too Many Requests',
        message: `Too many login attempts. Retry in ${rateCheck.retryAfterSeconds} seconds.`,
      };
    }

    const parsedBody = LoginBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      reply.status(400);
      return { error: 'Bad Request', message: 'Invalid login payload.' };
    }

    const providedPass = parsedBody.data.password?.trim();
    const providedEmail = parsedBody.data.email?.trim().toLowerCase();

    const configuredPass = config.demoAuth?.password;
    let valid = false;

    if (configuredPass) {
      // When a demo password is configured, password authentication is strictly required.
      valid = Boolean(providedPass && safeStringEqual(providedPass, configuredPass));
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
  server.get('/api/tools', async (request, reply) => {
    const query = request.query as { personaId?: string; courseId?: string };
    try {
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
    } catch (err: unknown) {
      reply.status(403);
      return {
        error: 'Forbidden',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // Execute a tool with role-based access control (critique §3.14, §8)
  server.post('/api/tools/execute', async (request, reply) => {
    if (!(await isAuthorized(request))) {
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
    if (!(await isAuthorized(request))) {
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
    const personaId = extractPersonaId(request, parsedBody.data.personaId);

    try {
      const auth = await ports.identity.resolveIdentity({ personaId, courseId });
      if (auth.tutorRole !== 'instructor') {
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

  // Conversation history endpoints (protected by authentication & caller verification)
  server.get('/api/conversations', async (request, reply) => {
    if (!(await isAuthorized(request))) {
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

    // Use denormalized title/messageCount when present; avoid N+1 fallback unless unset
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
    if (!(await isAuthorized(request))) {
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
    if (!query.personaId && !query.userId) {
      reply.status(400);
      return { error: 'Bad Request', message: 'personaId or userId query parameter is required.' };
    }

    let requesterUserId = query.userId;
    if (query.personaId) {
      const auth = await ports.identity.resolveIdentity({ personaId: query.personaId });
      requesterUserId = auth.userId;
    }

    if (conversation.userId !== requesterUserId) {
      reply.status(403);
      return { error: 'Forbidden', message: 'You do not have permission to view this conversation.' };
    }

    return ports.persistence.listMessages(id);
  });

  // "Clear my data" student opt-out endpoint (critique §3.1, §3.7)
  async function handleClearUserData(
    request: FastifyRequest,
    reply: FastifyReply,
    rawParamUserId: string,
  ) {
    if (!(await isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const query = (request.query || {}) as { personaId?: string };
    let targetUserId = rawParamUserId;

    if (query.personaId) {
      const auth = await ports.identity.resolveIdentity({ personaId: query.personaId });
      const matchesSelf =
        rawParamUserId === 'me' ||
        rawParamUserId === query.personaId ||
        rawParamUserId === auth.userId;
      if (!matchesSelf) {
        reply.status(403);
        return { error: 'Forbidden', message: 'You may only delete your own conversation data.' };
      }
      targetUserId = auth.userId;
    } else if (rawParamUserId === 'me') {
      const auth = await ports.identity.resolveIdentity({
        personaId: extractPersonaId(request),
      });
      targetUserId = auth.userId;
    } else if (
      config.canvas.demoPersonas.some((p) => p.id === rawParamUserId) ||
      rawParamUserId.startsWith('demo_')
    ) {
      const auth = await ports.identity.resolveIdentity({ personaId: rawParamUserId });
      targetUserId = auth.userId;
    }

    await ports.persistence.clearUserData(targetUserId);
    return { success: true, message: 'All user conversations and data cleared.' };
  }

  server.delete('/api/users/:userId/data', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    return handleClearUserData(request, reply, userId);
  });

  // One-command demo reset endpoint (critique §4.4, §8, plan Phase 5)
  server.post('/api/demo/reset', async (request, reply) => {
    if (!(await isAuthorized(request))) {
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
    if (!(await isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const personaId = extractPersonaId(request);
    try {
      const auth = await ports.identity.resolveIdentity({ personaId });
      if (auth.tutorRole !== 'instructor') {
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

  // Full streaming SSE chat endpoint driven by TutorEngine
  server.post('/api/chat', async (request, reply) => {
    if (!(await isAuthorized(request))) {
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
      pageContext: body.pageContext,
    });

    try {
      for await (const event of stream) {
        const sanitizedEvent = toClientStreamEvent(event);
        reply.raw.write(`data: ${JSON.stringify(sanitizedEvent)}\n\n`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      server.log.error(err);
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`);
    }

    reply.raw.end();
  });

  return server;
}
