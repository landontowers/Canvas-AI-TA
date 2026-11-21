import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { AppConfig, IdentityPort } from '@virtual-ta/core';
import { CanvasOAuthClient } from '@virtual-ta/adapters';
import { AuthGuard } from '../auth-guard.js';

export interface OAuthRoutesDeps {
  config: AppConfig;
  oauthClient: CanvasOAuthClient;
  identity: IdentityPort;
  authGuard: AuthGuard;
}

export function registerOAuthRoutes(server: FastifyInstance, deps: OAuthRoutesDeps): void {
  const { config, oauthClient, identity, authGuard } = deps;
  const pendingStates = new Map<string, { userId: string; expiresAt: number }>();

  server.get('/api/oauth/canvas/status', async (request, reply) => {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const token = authGuard.extractBearerToken(request);
    const query = (request.query || {}) as { personaId?: string };
    const auth = await identity.resolveIdentity({
      token,
      personaId: authGuard.extractPersonaId(request, query.personaId),
    });

    const userToken = oauthClient.getUserToken(auth.userId);
    return {
      enabled: Boolean(config.canvas.oauth?.enabled && oauthClient.isConfigured()),
      configured: oauthClient.isConfigured(),
      connected: Boolean(userToken),
      canvasUserId: userToken?.canvasUserId ?? null,
    };
  });

  server.get('/api/oauth/canvas/login', async (request, reply) => {
    if (!config.canvas.oauth?.enabled || !oauthClient.isConfigured()) {
      reply.status(400);
      return {
        error: 'Bad Request',
        message: 'Canvas OAuth2 opt-in is not enabled or configured.',
      };
    }

    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const token = authGuard.extractBearerToken(request);
    const query = (request.query || {}) as { personaId?: string };
    const auth = await identity.resolveIdentity({
      token,
      personaId: authGuard.extractPersonaId(request, query.personaId),
    });

    const state = crypto.randomBytes(24).toString('base64url');
    pendingStates.set(state, { userId: auth.userId, expiresAt: Date.now() + 300_000 });

    const url = oauthClient.buildAuthorizeUrl(state);
    if (request.headers.accept?.includes('application/json')) {
      return { redirectUrl: url, state };
    }
    return reply.redirect(url);
  });

  server.get('/api/oauth/canvas/callback', async (request, reply) => {
    const query = (request.query || {}) as { code?: string; state?: string; error?: string };
    if (query.error) {
      reply.status(400);
      return { error: 'OAuthError', message: query.error };
    }
    if (!query.code || !query.state) {
      reply.status(400);
      return { error: 'Bad Request', message: 'Missing code or state parameter.' };
    }

    const entry = pendingStates.get(query.state);
    pendingStates.delete(query.state);
    if (!entry || entry.expiresAt < Date.now()) {
      reply.status(400);
      return { error: 'Bad Request', message: 'Invalid or expired OAuth state.' };
    }

    const record = await oauthClient.exchangeCode(query.code);
    oauthClient.setUserToken(entry.userId, record);

    return {
      success: true,
      connected: true,
      canvasUserId: record.canvasUserId ?? null,
    };
  });

  server.post('/api/oauth/canvas/disconnect', async (request, reply) => {
    if (!(await authGuard.isAuthorized(request))) {
      reply.status(401);
      return { error: 'Unauthorized', message: 'Demo authentication required.' };
    }

    const token = authGuard.extractBearerToken(request);
    const body = (request.body || {}) as { personaId?: string };
    const auth = await identity.resolveIdentity({
      token,
      personaId: authGuard.extractPersonaId(request, body.personaId),
    });

    const disconnected = oauthClient.clearUserToken(auth.userId);
    return { success: true, disconnected };
  });
}
