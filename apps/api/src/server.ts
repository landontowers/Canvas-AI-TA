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
  createStandardToolRegistry,
  ToolRegistry,
  UnauthorizedToolError,
} from '@ai-tutor/core';
import {
  FakeLlmAdapter,
  FakeLmsAdapter,
  FakeIdentityAdapter,
  InMemoryPersistenceAdapter,
  InProcessCalculatorAdapter,
  FakeModerationAdapter,
  NoopTelemetryAdapter,
  CanvasClient,
  CanvasRestAdapter,
  CanvasDemoIdentityAdapter,
} from '@ai-tutor/adapters';

export interface PortsContainer {
  llm: LlmPort;
  lms: LmsPort;
  identity: IdentityPort;
  persistence: PersistencePort;
  calculator: CalculatorPort;
  moderation: ModerationPort;
  telemetry: TelemetryPort;
}

export function buildServer(
  config: AppConfig,
  portsOverride?: Partial<PortsContainer>,
): FastifyInstance {
  const server = Fastify({
    logger: config.env !== 'test',
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

  const ports: PortsContainer = {
    llm: portsOverride?.llm ?? new FakeLlmAdapter(),
    lms:
      portsOverride?.lms ??
      (defaultCanvasClient ? new CanvasRestAdapter(defaultCanvasClient) : new FakeLmsAdapter()),
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
    telemetry: portsOverride?.telemetry ?? new NoopTelemetryAdapter(),
  };

  const toolRegistry: ToolRegistry = createStandardToolRegistry();

  // Health check endpoint (Phase 1 exit criteria)
  server.get('/health', async () => {
    return {
      status: 'ok',
      env: config.env,
      college: config.college.id,
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
    };
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

  // Stream-event endpoint stub
  server.post('/api/chat', async (request, reply) => {
    const body = request.body as { personaId?: string; message: string; courseId?: string };
    const personaId = body.personaId || 'demo_student';
    const authContext = await ports.identity.resolveIdentity({
      personaId,
      courseId: body.courseId,
    });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const stream = ports.llm.stream({
      systemPrompt: `You are the ${authContext.tutorRole} tutor for ${config.college.name}.`,
      messages: [{ role: 'user', content: body.message }],
    });

    for await (const event of stream) {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    reply.raw.end();
  });

  return server;
}
