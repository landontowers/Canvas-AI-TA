import crypto from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { LtiIdentityAdapter } from './lti-identity.adapter.js';
import { SDI_DEMO_PERSONAS } from '../config/sdi.config.js';
import { FakeIdentityAdapter } from '../fake/fake-identity.adapter.js';

function signRs256Jwt(
  payload: Record<string, unknown>,
  privateKey: crypto.KeyObject,
  kid = 'platform-key-1',
): string {
  const header = { alg: 'RS256', typ: 'JWT', kid };
  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const sig = signer.sign(privateKey).toString('base64url');
  return `${signingInput}.${sig}`;
}

function buildValidLtiPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://canvas.instructure.com',
    aud: 'virtual-ta-lti-client',
    azp: 'virtual-ta-lti-client',
    sub: '1001',
    exp: nowSec + 300,
    iat: nowSec - 5,
    nonce: 'nonce-123',
    'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
    'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
    'https://purl.imsglobal.org/spec/lti/claim/deployment_id': 'sdi-deployment-1',
    'https://purl.imsglobal.org/spec/lti/claim/roles': [
      'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
    ],
    'https://purl.imsglobal.org/spec/lti/claim/context': {
      id: 'sdi-ftt101',
    },
    'https://purl.imsglobal.org/spec/lti/claim/target_link_uri':
      'http://localhost:5173/api/lti/launch?placement=top_navigation',
    'https://purl.imsglobal.org/spec/lti/claim/custom': {
      canvas_user_id: '1001',
      canvas_course_id: 'sdi-ftt101',
    },
    ...overrides,
  };
}

describe('LtiIdentityAdapter (Phase 6 LTI 1.3)', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const platformJwk = {
    ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
    kty: 'RSA',
    kid: 'platform-key-1',
    use: 'sig',
    alg: 'RS256',
  };

  it('publishes valid RSA public JWKS and Canvas Developer Key JSON config', () => {
    const adapter = new LtiIdentityAdapter({
      allowedPersonas: SDI_DEMO_PERSONAS,
      toolPublicUrl: 'https://virtual-ta.example.com',
    });

    const jwks = adapter.getPublicJwks();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0].kty).toBe('RSA');
    expect(jwks.keys[0].alg).toBe('RS256');
    expect(jwks.keys[0].kid).toBe('virtual-ta-lti-key-1');

    const config = adapter.getDeveloperKeyConfig() as Record<string, unknown>;
    expect(config.oidc_initiation_url).toBe('https://virtual-ta.example.com/api/lti/login');
    expect(config.target_link_uri).toBe('https://virtual-ta.example.com/api/lti/launch');
    expect(config.public_jwk_url).toBe('https://virtual-ta.example.com/api/lti/jwks');
    const extensions = config.extensions as Array<{ settings: { placements: Array<{ placement: string }> } }>;
    const placements = extensions[0].settings.placements.map((p) => p.placement);
    expect(placements).toContain('top_navigation');
    expect(placements).toContain('course_navigation');
  });

  it('initiates third-party OIDC login and validates state/nonce through student launch', async () => {
    const adapter = new LtiIdentityAdapter({
      allowedPersonas: SDI_DEMO_PERSONAS,
      platformPublicKeyPem: publicKeyPem,
      deploymentId: 'sdi-deployment-1',
    });

    const login = adapter.initiateOidcLogin({
      iss: 'https://canvas.instructure.com',
      loginHint: 'student-1001',
      ltiMessageHint: 'msg-hint-1',
    });
    expect(login.redirectUrl).toContain('state=' + login.state);
    expect(login.redirectUrl).toContain('nonce=' + login.nonce);
    expect(login.redirectUrl).toContain('lti_message_hint=msg-hint-1');

    const token = signRs256Jwt(buildValidLtiPayload({ nonce: login.nonce }), privateKey);
    const launched = await adapter.validateLaunch({ idToken: token, state: login.state });

    expect(launched.sessionToken).toMatch(/^lti_/);
    expect(launched.personaId).toBe('demo_student');
    expect(launched.placement).toBe('top_navigation');
    expect(launched.context.assistantRole).toBe('student');
    expect(launched.context.canvasUserId).toBe('1001');

    // Reusing the one-time OIDC state must fail
    await expect(adapter.validateLaunch({ idToken: token, state: login.state })).rejects.toThrow(
      /Invalid or expired LTI state/i,
    );

    // Resolving with active lti_ session ignores spoofed client personaId
    const resolved = await adapter.resolveIdentity({
      token: launched.sessionToken,
      personaId: 'demo_instructor',
    });
    expect(resolved.assistantRole).toBe('student');
    expect(resolved.canvasUserId).toBe('1001');
  });

  it('derives course role strictly from signed LTI claim via remote JWKS fetch & caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [platformJwk] }),
    });

    const adapter = new LtiIdentityAdapter({
      allowedPersonas: SDI_DEMO_PERSONAS,
      platformJwksUrl: 'https://classroom.sdi.edu/api/lti/security/jwks',
      deploymentId: 'sdi-deployment-1',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    // Even for canvasUserId=1001 (demo_student), signed TeachingAssistant LTI claim resolves to instructor
    const jwt = signRs256Jwt(
      buildValidLtiPayload({
        'https://purl.imsglobal.org/spec/lti/claim/roles': [
          'http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant',
        ],
        'https://purl.imsglobal.org/spec/lti/claim/target_link_uri':
          'http://localhost:5173/api/lti/launch?placement=course_navigation',
      }),
      privateKey,
    );

    const launch = await adapter.validateLaunch({ idToken: jwt });
    expect(launch.context.assistantRole).toBe('instructor');
    expect(launch.placement).toBe('course_navigation');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second JWT launch reuses cached JWKS without extra fetch
    const resolvedDirectJwt = await adapter.resolveIdentity({ token: jwt });
    expect(resolvedDirectJwt.assistantRole).toBe('instructor');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects untrusted OIDC login params, tampered/expired tokens, and unallowlisted users', async () => {
    const fallback = new FakeIdentityAdapter();
    const adapter = new LtiIdentityAdapter({
      allowedPersonas: SDI_DEMO_PERSONAS,
      platformPublicKeyPem: publicKeyPem,
      deploymentId: 'sdi-deployment-1',
      fallbackIdentity: fallback,
    });

    expect(() =>
      adapter.initiateOidcLogin({ iss: 'https://evil.example.com', loginHint: 'u1' }),
    ).toThrow(/Untrusted LTI issuer/i);
    expect(() =>
      adapter.initiateOidcLogin({ iss: 'https://canvas.instructure.com', loginHint: '   ' }),
    ).toThrow(/login_hint is required/i);
    expect(() =>
      adapter.initiateOidcLogin({
        iss: 'https://canvas.instructure.com',
        loginHint: 'u1',
        clientId: 'wrong-client',
      }),
    ).toThrow(/client_id/i);

    const otherKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const tampered = signRs256Jwt(buildValidLtiPayload(), otherKey);
    await expect(adapter.validateLaunch({ idToken: tampered })).rejects.toThrow(/signature/i);

    const expired = signRs256Jwt(
      buildValidLtiPayload({ exp: Math.floor(Date.now() / 1000) - 60 }),
      privateKey,
    );
    await expect(adapter.validateLaunch({ idToken: expired })).rejects.toThrow(/expired/i);

    const wrongDeploy = signRs256Jwt(
      buildValidLtiPayload({
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id': 'other-deploy',
      }),
      privateKey,
    );
    await expect(adapter.validateLaunch({ idToken: wrongDeploy })).rejects.toThrow(/deployment_id/i);

    const unallowlisted = signRs256Jwt(
      buildValidLtiPayload({
        sub: '9999',
        'https://purl.imsglobal.org/spec/lti/claim/custom': { canvas_user_id: '9999' },
      }),
      privateKey,
    );
    await expect(adapter.validateLaunch({ idToken: unallowlisted })).rejects.toThrow(
      /test-account allowlist/i,
    );

    await expect(adapter.resolveIdentity({ token: 'lti_nonexistent_token' })).rejects.toThrow(
      /Invalid or expired LTI session/i,
    );

    // Non-LTI call delegates to fallback identity adapter
    const fallbackCtx = await adapter.resolveIdentity({ personaId: 'demo_ta' });
    expect(fallbackCtx.assistantRole).toBe('instructor');
  });
});
