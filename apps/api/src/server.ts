import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
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
  VirtualTaEngine,
} from '@virtual-ta/core';
import {
  FakeLlmAdapter,
  FakeLmsAdapter,
  FakeIdentityAdapter,
  InMemoryPersistenceAdapter,
  InProcessCalculatorAdapter,
  ContextualModerationAdapter,
  NoopTelemetryAdapter,
  PrivacyTelemetryAdapter,
  WebhookCrisisAlertAdapter,
  AzureBlobLogStorageAdapter,
  CanvasClient,
  CanvasRestAdapter,
  CanvasOAuthClient,
  AzureOpenAiAdapter,
  CanvasDemoIdentityAdapter,
  LtiIdentityAdapter,
  GeminiAdapter,
  createDrizzlePersistence,
} from '@virtual-ta/adapters';
import { CloudflareAccessVerifier } from './cf-access.js';
import { SlidingWindowRateLimiter } from './rate-limiter.js';
import { createAuthGuard } from './auth-guard.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerLtiRoutes } from './routes/lti.routes.js';
import { registerOAuthRoutes } from './routes/oauth.routes.js';
import { registerCourseAndToolsRoutes } from './routes/course-and-tools.routes.js';
import { registerConversationsAndAdminRoutes } from './routes/conversations-and-admin.routes.js';

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
                'req.headers["x-lti-token"]',
                'req.headers.cookie',
                'req.headers["cf-access-jwt-assertion"]',
                'req.body.message',
                'req.body.password',
                'req.body.token',
                'req.body.accessToken',
                'req.body.id_token',
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
    const hasVertexConfig = Boolean(config.model.useVertexAi && config.model.gcpProject);
    if (!hasVertexConfig && !config.model.apiKey) {
      server.log.warn(
        'MODEL_PROVIDER is set to "gemini", but neither GEMINI_API_KEY nor Vertex AI (GOOGLE_GENAI_USE_VERTEXAI=true + GOOGLE_CLOUD_PROJECT) is configured. Falling back to FakeLlmAdapter.',
      );
      defaultLlm = new FakeLlmAdapter();
      defaultInstructorLlm = defaultLlm;
      defaultClassifierLlm = defaultLlm;
    } else {
      server.log.info(
        `Configuring GeminiAdapter (${hasVertexConfig ? `vertexai project=${config.model.gcpProject} location=${config.model.gcpLocation}` : 'ai-studio'}) with studentModel=${config.model.studentModel}, instructorModel=${config.model.instructorModel}, classifierModel=${config.model.classifierModel}`,
      );
      const geminiBase = {
        apiKey: config.model.apiKey,
        vertexai: config.model.useVertexAi,
        project: config.model.gcpProject,
        location: config.model.gcpLocation,
        fallbackModel: 'gemini-3.7-flash',
      };
      defaultLlm = new GeminiAdapter({
        ...geminiBase,
        defaultModel: config.model.studentModel,
      });
      defaultInstructorLlm = new GeminiAdapter({
        ...geminiBase,
        defaultModel: config.model.instructorModel,
      });
      defaultClassifierLlm = new GeminiAdapter({
        ...geminiBase,
        defaultModel: config.model.classifierModel,
      });
    }
  } else if (config.model.provider === 'azure-openai') {
    if (!config.model.apiKey || !config.model.azureEndpoint) {
      server.log.warn(
        'MODEL_PROVIDER is set to "azure-openai", but AZURE_OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT is missing. Falling back to FakeLlmAdapter.',
      );
      defaultLlm = new FakeLlmAdapter();
      defaultInstructorLlm = defaultLlm;
      defaultClassifierLlm = defaultLlm;
    } else {
      server.log.info(
        `Configuring AzureOpenAiAdapter with studentDeployment=${config.model.studentModel}, instructorDeployment=${config.model.instructorModel}, classifierDeployment=${config.model.classifierModel}`,
      );
      defaultLlm = new AzureOpenAiAdapter({
        endpoint: config.model.azureEndpoint,
        apiKey: config.model.apiKey,
        deployment: config.model.studentModel,
        apiVersion: config.model.azureApiVersion,
      });
      defaultInstructorLlm = new AzureOpenAiAdapter({
        endpoint: config.model.azureEndpoint,
        apiKey: config.model.apiKey,
        deployment: config.model.instructorModel,
        apiVersion: config.model.azureApiVersion,
      });
      defaultClassifierLlm = new AzureOpenAiAdapter({
        endpoint: config.model.azureEndpoint,
        apiKey: config.model.apiKey,
        deployment: config.model.classifierModel,
        apiVersion: config.model.azureApiVersion,
      });
    }
  } else {
    defaultLlm = new FakeLlmAdapter();
    defaultInstructorLlm = defaultLlm;
    defaultClassifierLlm = defaultLlm;
  }

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

  const baseIdentity: IdentityPort =
    portsOverride?.identity ??
    (defaultCanvasClient
      ? new CanvasDemoIdentityAdapter({
          client: defaultCanvasClient,
          allowedPersonas: config.canvas.demoPersonas,
          collegeId: config.college.id,
        })
      : new FakeIdentityAdapter());

  const ltiAdapter =
    baseIdentity instanceof LtiIdentityAdapter
      ? baseIdentity
      : new LtiIdentityAdapter({
          collegeId: config.college.id,
          allowedPersonas: config.canvas.demoPersonas,
          issuer: config.lti.issuer,
          clientId: config.lti.clientId,
          deploymentId: config.lti.deploymentId,
          platformAuthUrl: config.lti.platformAuthUrl,
          platformJwksUrl: config.lti.platformJwksUrl,
          toolPublicUrl: config.lti.toolPublicUrl,
          fallbackIdentity: baseIdentity,
        });

  const ltiIdentityActive = config.lti.enabled || baseIdentity instanceof LtiIdentityAdapter;
  const resolvedIdentity: IdentityPort = portsOverride?.identity
    ? portsOverride.identity
    : ltiIdentityActive
      ? ltiAdapter
      : baseIdentity;

  const ports: PortsContainer = {
    llm: portsOverride?.llm ?? defaultLlm,
    instructorLlm:
      portsOverride?.instructorLlm ?? (portsOverride?.llm ? portsOverride.llm : defaultInstructorLlm),
    classifierLlm:
      portsOverride?.classifierLlm ?? (portsOverride?.llm ? portsOverride.llm : defaultClassifierLlm),
    lms:
      portsOverride?.lms ??
      (useFakeLms ? new FakeLmsAdapter() : new CanvasRestAdapter(defaultCanvasClient!)),
    identity: resolvedIdentity,
    persistence: resolvedPersistence,
    calculator: portsOverride?.calculator ?? new InProcessCalculatorAdapter(),
    moderation:
      portsOverride?.moderation ??
      new ContextualModerationAdapter({
        crisisMessage: config.college.crisis.message,
        classifierLlm:
          config.model.provider === 'gemini' && config.model.apiKey
            ? defaultClassifierLlm
            : undefined,
      }),
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

  const authGuard = createAuthGuard({
    config,
    cfVerifier,
    activeSessions,
    ltiAdapter,
    ltiIdentityActive,
  });

  const engine = new VirtualTaEngine({
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

  registerAuthRoutes(server, {
    config,
    authGuard,
    loginLimiter,
    activeSessions,
    hasLiveCanvas: Boolean(defaultCanvasClient),
    useFakeLms,
  });

  registerLtiRoutes(server, {
    config,
    ltiAdapter,
    ltiIdentityActive,
    authGuard,
  });

  const oauthClient = new CanvasOAuthClient({
    baseUrl: config.canvas.baseUrl,
    clientId: config.canvas.oauth?.clientId,
    clientSecret: config.canvas.oauth?.clientSecret,
    redirectUri: config.canvas.oauth?.redirectUri,
  });

  registerOAuthRoutes(server, {
    config,
    oauthClient,
    identity: ports.identity,
    authGuard,
  });

  registerCourseAndToolsRoutes(server, {
    ports,
    toolRegistry,
    authGuard,
  });

  registerConversationsAndAdminRoutes(server, {
    config,
    ports,
    engine,
    authGuard,
    chatLimiter,
  });

  return server;
}
