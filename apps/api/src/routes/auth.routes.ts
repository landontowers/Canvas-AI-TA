import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { AppConfig } from '@virtual-ta/core';
import { SlidingWindowRateLimiter } from '../rate-limiter.js';
import { AuthGuard } from '../auth-guard.js';
import { LoginBodySchema, safeStringEqual } from '../schemas.js';

export interface AuthRoutesDeps {
  config: AppConfig;
  authGuard: AuthGuard;
  loginLimiter: SlidingWindowRateLimiter;
  activeSessions: Set<string>;
  hasLiveCanvas: boolean;
  useFakeLms: boolean;
}

export function registerAuthRoutes(server: FastifyInstance, deps: AuthRoutesDeps): void {
  const { config, authGuard, loginLimiter, activeSessions, hasLiveCanvas, useFakeLms } = deps;

  server.get('/health', async () => {
    return {
      status: 'ok',
      env: config.env,
      college: config.college.id,
      modelProvider: config.model.provider,
      canvasConnected: hasLiveCanvas,
      fakeCourseData: useFakeLms,
      timestamp: new Date().toISOString(),
    };
  });

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
      canvasConnected: hasLiveCanvas,
      fakeCourseData: useFakeLms,
      demoAuth: {
        enabled: config.demoAuth?.enabled ?? false,
      },
    };
  });

  server.get('/api/auth/status', async (request) => {
    if (!config.demoAuth?.enabled) {
      return { authRequired: false, authenticated: true };
    }
    const cfEmail = request.headers['cf-access-authenticated-user-email'];
    const email = typeof cfEmail === 'string' ? cfEmail : undefined;
    const authenticated = await authGuard.isAuthorized(request);
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
    const token = authGuard.extractBearerToken(request);
    if (token) {
      activeSessions.delete(token);
    }
    return { success: true };
  });
}
