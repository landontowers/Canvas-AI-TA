import { FastifyRequest } from 'fastify';
import { AppConfig } from '@virtual-ta/core';
import { LtiIdentityAdapter } from '@virtual-ta/adapters';
import { CloudflareAccessVerifier } from './cf-access.js';

export interface AuthGuard {
  extractBearerToken(request: FastifyRequest): string | undefined;
  extractPersonaId(request: FastifyRequest, bodyPersonaId?: string): string;
  isAuthorized(request: FastifyRequest): Promise<boolean>;
}

export interface CreateAuthGuardOptions {
  config: AppConfig;
  cfVerifier: CloudflareAccessVerifier;
  activeSessions: Set<string>;
  ltiAdapter: LtiIdentityAdapter;
  ltiIdentityActive: boolean;
}

export function createAuthGuard(options: CreateAuthGuardOptions): AuthGuard {
  const { config, cfVerifier, activeSessions, ltiAdapter, ltiIdentityActive } = options;

  function extractBearerToken(request: FastifyRequest): string | undefined {
    const authHeader = request.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token.length > 0) return token;
    }

    const ltiHeader = request.headers['x-lti-token'];
    if (typeof ltiHeader === 'string' && ltiHeader.trim().length > 0) {
      return ltiHeader.trim();
    }

    return undefined;
  }

  function extractPersonaId(request: FastifyRequest, bodyPersonaId?: string): string {
    const query = (request.query || {}) as { personaId?: string };
    const headerPersona = request.headers['x-persona-id'];
    if (bodyPersonaId && bodyPersonaId.trim()) return bodyPersonaId.trim();
    if (query.personaId && query.personaId.trim()) return query.personaId.trim();
    if (typeof headerPersona === 'string' && headerPersona.trim()) return headerPersona.trim();
    return 'demo_student';
  }

  async function isAuthorized(request: FastifyRequest): Promise<boolean> {
    const token = extractBearerToken(request);
    if (ltiIdentityActive && token && ltiAdapter.getSession(token)) {
      return true;
    }

    if (!config.demoAuth?.enabled) return true;

    const cfEmail = request.headers['cf-access-authenticated-user-email'];
    const cfJwt = request.headers['cf-access-jwt-assertion'];
    if (await cfVerifier.verifyHeaders(cfEmail, cfJwt)) {
      return true;
    }

    if (token && activeSessions.has(token)) {
      return true;
    }

    return false;
  }

  return {
    extractBearerToken,
    extractPersonaId,
    isAuthorized,
  };
}
