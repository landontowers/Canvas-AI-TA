import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppConfig } from '@virtual-ta/core';
import { LtiIdentityAdapter } from '@virtual-ta/adapters';
import { AuthGuard } from '../auth-guard.js';
import { LtiLaunchBodySchema, LtiLoginParamsSchema } from '../schemas.js';

export interface LtiRoutesDeps {
  config: AppConfig;
  ltiAdapter: LtiIdentityAdapter;
  ltiIdentityActive: boolean;
  authGuard: AuthGuard;
}

export function registerLtiRoutes(server: FastifyInstance, deps: LtiRoutesDeps): void {
  const { config, ltiAdapter, ltiIdentityActive, authGuard } = deps;

  if (!server.hasContentTypeParser('application/x-www-form-urlencoded')) {
    server.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_req, body, done) => {
        try {
          const parsed = Object.fromEntries(new URLSearchParams(String(body)).entries());
          done(null, parsed);
        } catch (err) {
          done(err as Error, undefined);
        }
      },
    );
  }

  server.get('/api/lti/config', async () => {
    return ltiAdapter.getDeveloperKeyConfig(config.lti.toolPublicUrl);
  });

  server.get('/api/lti/jwks', async () => {
    return ltiAdapter.getPublicJwks();
  });

  async function handleOidcLogin(request: FastifyRequest, reply: FastifyReply) {
    if (!ltiIdentityActive) {
      reply.status(403);
      return {
        error: 'Forbidden',
        message: 'LTI 1.3 launches are disabled on this server (set LTI_ENABLED=true).',
      };
    }

    const rawParams = request.method === 'GET' ? request.query : request.body;
    const parsed = LtiLoginParamsSchema.safeParse(rawParams ?? {});
    if (!parsed.success) {
      reply.status(400);
      return {
        error: 'Bad Request',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      };
    }

    try {
      const result = ltiAdapter.initiateOidcLogin({
        iss: parsed.data.iss,
        loginHint: parsed.data.login_hint,
        targetLinkUri: parsed.data.target_link_uri,
        ltiMessageHint: parsed.data.lti_message_hint,
        clientId: parsed.data.client_id,
      });

      if (request.headers.accept?.includes('application/json')) {
        return result;
      }

      reply.status(302).header('Location', result.redirectUrl).send();
      return reply;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.status(msg.startsWith('Unauthorized') ? 401 : 400);
      return {
        error: msg.startsWith('Unauthorized') ? 'Unauthorized' : 'Bad Request',
        message: msg,
      };
    }
  }

  server.get('/api/lti/login', handleOidcLogin);
  server.post('/api/lti/login', handleOidcLogin);

  server.post('/api/lti/launch', async (request, reply) => {
    if (!ltiIdentityActive) {
      reply.status(403);
      return {
        error: 'Forbidden',
        message: 'LTI 1.3 launches are disabled on this server (set LTI_ENABLED=true).',
      };
    }

    const parsed = LtiLaunchBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.status(400);
      return {
        error: 'Bad Request',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      };
    }

    try {
      const launch = await ltiAdapter.validateLaunch({
        idToken: parsed.data.id_token,
        state: parsed.data.state,
      });

      if (request.headers.accept?.includes('application/json')) {
        return launch;
      }

      const redirectUrl = `/?embedded=true&ltiToken=${encodeURIComponent(launch.sessionToken)}&placement=${encodeURIComponent(launch.placement)}&courseId=${encodeURIComponent(launch.context.courseId)}`;
      reply.status(302).header('Location', redirectUrl).send();
      return reply;
    } catch (err: unknown) {
      reply.status(401);
      return {
        error: 'Unauthorized',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  server.get('/api/lti/session', async (request, reply) => {
    const token = authGuard.extractBearerToken(request);
    const session = ltiIdentityActive ? ltiAdapter.getSession(token) : null;
    if (!session) {
      reply.status(401);
      return {
        error: 'Unauthorized',
        message: 'Valid LTI launch session token is required.',
      };
    }

    return {
      context: session.context,
      personaId: session.personaId,
      placement: session.placement,
    };
  });
}
