import crypto from 'node:crypto';
import {
  IdentityPort,
  AuthUserContext,
  DemoPersona,
  resolveAssistantRole,
} from '@virtual-ta/core';

export type LtiPlacement = 'top_navigation' | 'course_navigation';

export interface LtiSessionRecord {
  sessionToken: string;
  context: AuthUserContext;
  personaId: string;
  placement: LtiPlacement;
  expiresAt: number;
}

export interface LtiOidcLoginParams {
  iss: string;
  loginHint: string;
  targetLinkUri?: string;
  ltiMessageHint?: string;
  clientId?: string;
}

export interface LtiOidcLoginResult {
  state: string;
  nonce: string;
  redirectUrl: string;
}

export interface LtiLaunchValidationResult {
  sessionToken: string;
  context: AuthUserContext;
  personaId: string;
  placement: LtiPlacement;
}

export interface LtiIdentityAdapterOptions {
  collegeId?: string;
  allowedPersonas: DemoPersona[];
  issuer?: string;
  clientId?: string;
  deploymentId?: string;
  platformAuthUrl?: string;
  platformJwksUrl?: string;
  toolPublicUrl?: string;
  platformPublicKeyPem?: string;
  platformJwks?: Array<Record<string, unknown>>;
  fetchFn?: typeof fetch;
  fallbackIdentity?: IdentityPort;
  sessionTtlMs?: number;
  stateTtlMs?: number;
  jwksTtlMs?: number;
}

interface PendingOidcState {
  nonce: string;
  targetLinkUri?: string;
  expiresAt: number;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
}

const LTI_CLAIM_VERSION = 'https://purl.imsglobal.org/spec/lti/claim/version';
const LTI_CLAIM_MESSAGE_TYPE = 'https://purl.imsglobal.org/spec/lti/claim/message_type';
const LTI_CLAIM_DEPLOYMENT_ID = 'https://purl.imsglobal.org/spec/lti/claim/deployment_id';
const LTI_CLAIM_ROLES = 'https://purl.imsglobal.org/spec/lti/claim/roles';
const LTI_CLAIM_CONTEXT = 'https://purl.imsglobal.org/spec/lti/claim/context';
const LTI_CLAIM_TARGET_LINK_URI = 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri';
const LTI_CLAIM_CUSTOM = 'https://purl.imsglobal.org/spec/lti/claim/custom';

function decodeBase64UrlJson<T>(segment: string): T | null {
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * LTI 1.3 identity & launch adapter (Phase 6, critique §3.1, §3.14, §4.5).
 * Validates signed RS256 OIDC ID tokens from Canvas, enforces the test-account allowlist,
 * derives course roles strictly from signed LTI claims, and maintains short-lived launch sessions.
 */
export class LtiIdentityAdapter implements IdentityPort {
  private collegeId: string;
  private allowedPersonas: DemoPersona[];
  private personasById: Map<string, DemoPersona>;
  private issuer: string;
  private clientId: string;
  private deploymentId?: string;
  private platformAuthUrl: string;
  private platformJwksUrl?: string;
  private toolPublicUrl: string;
  private platformPublicKeyPem?: string;
  private platformJwks?: Array<Record<string, unknown>>;
  private fetchFn: typeof fetch;
  private fallbackIdentity?: IdentityPort;
  private sessionTtlMs: number;
  private stateTtlMs: number;
  private jwksTtlMs: number;

  private toolKeyPair?: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };
  private cachedRemoteJwks: Array<Record<string, unknown>> = [];
  private cachedRemoteJwksExpiresAt = 0;
  private pendingStates = new Map<string, PendingOidcState>();
  private activeLaunchSessions = new Map<string, LtiSessionRecord>();

  constructor(options: LtiIdentityAdapterOptions) {
    this.collegeId = options.collegeId || 'sdi';
    this.allowedPersonas = options.allowedPersonas;
    this.personasById = new Map(options.allowedPersonas.map((p) => [p.id, p]));
    this.issuer = (options.issuer || 'https://canvas.instructure.com').replace(/\/+$/, '');
    this.clientId = options.clientId || 'virtual-ta-lti-client';
    this.deploymentId = options.deploymentId;
    this.platformAuthUrl =
      options.platformAuthUrl || 'https://classroom.sdi.edu/api/lti/authorize_redirect';
    this.platformJwksUrl = options.platformJwksUrl;
    this.toolPublicUrl = (options.toolPublicUrl || 'http://localhost:5173').replace(/\/+$/, '');
    this.platformPublicKeyPem = options.platformPublicKeyPem;
    this.platformJwks = options.platformJwks;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.fallbackIdentity = options.fallbackIdentity;
    this.sessionTtlMs = options.sessionTtlMs ?? 8 * 60 * 60_000;
    this.stateTtlMs = options.stateTtlMs ?? 5 * 60_000;
    this.jwksTtlMs = options.jwksTtlMs ?? 5 * 60_000;
  }

  /**
   * Returns the tool's public RSA JWK set for Canvas Developer Key registration.
   */
  getPublicJwks(): { keys: Array<Record<string, unknown>> } {
    if (!this.toolKeyPair) {
      this.toolKeyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    }
    const jwk = this.toolKeyPair.publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
    return {
      keys: [
        {
          ...jwk,
          kty: 'RSA',
          kid: 'virtual-ta-lti-key-1',
          use: 'sig',
          alg: 'RS256',
        },
      ],
    };
  }

  /**
   * Returns the Canvas LTI 1.3 Developer Key registration JSON (top_navigation & course_navigation).
   */
  getDeveloperKeyConfig(publicUrlOverride?: string): Record<string, unknown> {
    const baseUrl = (publicUrlOverride || this.toolPublicUrl).replace(/\/+$/, '');
    const launchUrl = `${baseUrl}/api/lti/launch`;
    return {
      title: 'SDI Virtual TA',
      description: 'Socratic student Virtual TA and read-only instructor teaching assistant.',
      oidc_initiation_url: `${baseUrl}/api/lti/login`,
      target_link_uri: launchUrl,
      public_jwk_url: `${baseUrl}/api/lti/jwks`,
      scopes: ['https://canvas.instructure.com/lti/page_content/show'],
      extensions: [
        {
          platform: 'canvas.instructure.com',
          settings: {
            platform: 'canvas.instructure.com',
            placements: [
              {
                placement: 'top_navigation',
                enabled: true,
                text: 'Virtual TA',
                target_link_uri: `${launchUrl}?placement=top_navigation`,
                message_type: 'LtiResourceLinkRequest',
                windowTarget: '_drawer',
              },
              {
                placement: 'course_navigation',
                enabled: true,
                text: 'Virtual TA Settings',
                visibility: 'admins',
                default: 'enabled',
                target_link_uri: `${launchUrl}?placement=course_navigation`,
                message_type: 'LtiResourceLinkRequest',
              },
            ],
          },
        },
      ],
      custom_fields: {
        canvas_user_id: '$Canvas.user.id',
        canvas_course_id: '$Canvas.course.id',
      },
    };
  }

  /**
   * Handles step 1 of LTI 1.3 third-party OIDC login initiation.
   */
  initiateOidcLogin(params: LtiOidcLoginParams): LtiOidcLoginResult {
    const normalizedIss = params.iss.trim().replace(/\/+$/, '');
    if (!normalizedIss || normalizedIss !== this.issuer) {
      throw new Error(`Unauthorized: Untrusted LTI issuer '${params.iss}'.`);
    }

    const loginHint = params.loginHint.trim();
    if (!loginHint) {
      throw new Error('Bad Request: login_hint is required for LTI OIDC initiation.');
    }

    if (params.clientId && params.clientId.trim() !== this.clientId) {
      throw new Error(`Unauthorized: Unexpected LTI client_id '${params.clientId}'.`);
    }

    const now = Date.now();
    this.pruneExpiredEntries(now);

    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const redirectUri = params.targetLinkUri?.trim() || `${this.toolPublicUrl}/api/lti/launch`;

    this.pendingStates.set(state, {
      nonce,
      targetLinkUri: redirectUri,
      expiresAt: now + this.stateTtlMs,
    });

    const authUrl = new URL(this.platformAuthUrl);
    authUrl.searchParams.set('scope', 'openid');
    authUrl.searchParams.set('response_type', 'id_token');
    authUrl.searchParams.set('response_mode', 'form_post');
    authUrl.searchParams.set('prompt', 'none');
    authUrl.searchParams.set('client_id', this.clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('login_hint', loginHint);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);
    if (params.ltiMessageHint) {
      authUrl.searchParams.set('lti_message_hint', params.ltiMessageHint);
    }

    return {
      state,
      nonce,
      redirectUrl: authUrl.toString(),
    };
  }

  /**
   * Validates an LTI 1.3 RS256 ID token, checks test-account allowlist, and mints a launch session.
   */
  async validateLaunch(params: {
    idToken: string;
    state?: string;
  }): Promise<LtiLaunchValidationResult> {
    const now = Date.now();
    this.pruneExpiredEntries(now);

    let expectedNonce: string | undefined;
    if (params.state !== undefined) {
      const pending = this.pendingStates.get(params.state);
      this.pendingStates.delete(params.state);
      if (!pending || pending.expiresAt < now) {
        throw new Error('Unauthorized: Invalid or expired LTI state.');
      }
      expectedNonce = pending.nonce;
    }

    const payload = await this.verifyJwtSignatureAndDecode(params.idToken);

    const tokenIss = typeof payload.iss === 'string' ? payload.iss.replace(/\/+$/, '') : '';
    if (!tokenIss || tokenIss !== this.issuer) {
      throw new Error('Unauthorized: LTI launch issuer mismatch.');
    }

    const aud = payload.aud;
    const audMatches =
      typeof aud === 'string'
        ? aud === this.clientId
        : Array.isArray(aud) && aud.includes(this.clientId);
    if (!audMatches) {
      throw new Error('Unauthorized: LTI launch audience mismatch.');
    }

    if (typeof payload.azp === 'string' && payload.azp !== this.clientId) {
      throw new Error('Unauthorized: LTI launch authorized party (azp) mismatch.');
    }

    if (this.deploymentId) {
      const claimDeployment = payload[LTI_CLAIM_DEPLOYMENT_ID];
      if (claimDeployment !== this.deploymentId) {
        throw new Error('Unauthorized: LTI deployment_id mismatch.');
      }
    }

    const nowSec = Math.floor(now / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
      throw new Error('Unauthorized: LTI launch token has expired.');
    }
    if (typeof payload.nbf === 'number' && payload.nbf > nowSec) {
      throw new Error('Unauthorized: LTI launch token is not yet valid.');
    }

    const tokenNonce = typeof payload.nonce === 'string' ? payload.nonce : '';
    if (!tokenNonce) {
      throw new Error('Unauthorized: LTI launch token is missing required nonce claim.');
    }
    if (expectedNonce && tokenNonce !== expectedNonce) {
      throw new Error('Unauthorized: LTI launch nonce mismatch.');
    }

    if (payload[LTI_CLAIM_VERSION] !== '1.3.0') {
      throw new Error('Unauthorized: Unsupported LTI version claim.');
    }
    if (payload[LTI_CLAIM_MESSAGE_TYPE] !== 'LtiResourceLinkRequest') {
      throw new Error('Unauthorized: Unsupported LTI message_type claim.');
    }

    const rawRoles = payload[LTI_CLAIM_ROLES];
    if (!Array.isArray(rawRoles) || rawRoles.length === 0) {
      throw new Error('Unauthorized: LTI launch token missing roles claim.');
    }
    const roles = rawRoles.map((r) => String(r));

    const custom = (payload[LTI_CLAIM_CUSTOM] ?? {}) as Record<string, unknown>;
    const rawUserId = custom.canvas_user_id ?? custom.user_id ?? payload.sub;
    const canvasUserId = typeof rawUserId === 'string' || typeof rawUserId === 'number'
      ? String(rawUserId).trim()
      : '';

    if (!canvasUserId) {
      throw new Error('Unauthorized: LTI launch token missing user subject.');
    }

    // Phase 6 safeguard: allow masquerading only for test accounts on the allowlist
    const matchedPersona = this.allowedPersonas.find(
      (p) => p.canvasUserId === canvasUserId || p.id === canvasUserId,
    );
    if (!matchedPersona) {
      throw new Error(
        `Unauthorized: Launched Canvas user '${canvasUserId}' is not on the test-account allowlist.`,
      );
    }

    const contextClaim = (payload[LTI_CLAIM_CONTEXT] ?? {}) as Record<string, unknown>;
    const courseIdRaw = custom.canvas_course_id ?? custom.course_id ?? contextClaim.id;
    const courseId =
      typeof courseIdRaw === 'string' && courseIdRaw.trim().length > 0
        ? courseIdRaw.trim()
        : 'sdi-ftt101';

    const targetLinkUri =
      typeof payload[LTI_CLAIM_TARGET_LINK_URI] === 'string'
        ? payload[LTI_CLAIM_TARGET_LINK_URI]
        : '';
    const placement: LtiPlacement =
      custom.placement === 'course_navigation' || targetLinkUri.includes('placement=course_navigation')
        ? 'course_navigation'
        : 'top_navigation';

    // Fixed rule determines Virtual TA role strictly from signed LTI launch roles claim
    const assistantRole = resolveAssistantRole(roles);

    const context: AuthUserContext = {
      userId: `user-${matchedPersona.canvasUserId}`,
      canvasUserId: matchedPersona.canvasUserId,
      collegeId: this.collegeId,
      courseId,
      roles,
      assistantRole,
    };

    const sessionToken = `lti_${crypto.randomUUID()}`;
    this.activeLaunchSessions.set(sessionToken, {
      sessionToken,
      context,
      personaId: matchedPersona.id,
      placement,
      expiresAt: now + this.sessionTtlMs,
    });

    return {
      sessionToken,
      context,
      personaId: matchedPersona.id,
      placement,
    };
  }

  /**
   * Retrieves an active signed-launch LTI session if present and unexpired.
   */
  getSession(token?: string): LtiSessionRecord | null {
    if (!token || !token.startsWith('lti_')) {
      return null;
    }
    const session = this.activeLaunchSessions.get(token);
    if (!session) {
      return null;
    }
    if (session.expiresAt <= Date.now()) {
      this.activeLaunchSessions.delete(token);
      return null;
    }
    return session;
  }

  /**
   * Resolves caller identity: signed LTI launch session/JWT overrides any client-supplied persona.
   */
  async resolveIdentity(params: {
    token?: string;
    personaId?: string;
    courseId?: string;
  }): Promise<AuthUserContext> {
    if (params.token) {
      if (params.token.startsWith('lti_')) {
        const session = this.getSession(params.token);
        if (!session) {
          throw new Error('Unauthorized: Invalid or expired LTI session token.');
        }
        return { ...session.context };
      }

      if (params.token.split('.').length === 3) {
        const validated = await this.validateLaunch({ idToken: params.token });
        return validated.context;
      }
    }

    if (this.fallbackIdentity) {
      return this.fallbackIdentity.resolveIdentity(params);
    }

    const personaKey = params.personaId || 'demo_student';
    const persona = this.personasById.get(personaKey);
    if (!persona) {
      throw new Error(`Unauthorized: Persona '${personaKey}' is not on the demo allowlist.`);
    }

    const roles = [persona.role === 'instructor' ? 'Instructor' : 'Learner'];
    return {
      userId: `user-${persona.canvasUserId}`,
      canvasUserId: persona.canvasUserId,
      collegeId: this.collegeId,
      courseId: params.courseId || 'sdi-ftt101',
      roles,
      assistantRole: resolveAssistantRole(roles),
    };
  }

  private async verifyJwtSignatureAndDecode(idToken: string): Promise<Record<string, unknown>> {
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Unauthorized: Malformed LTI ID token.');
    }

    const [headerB64, payloadB64, sigB64] = parts;
    const header = decodeBase64UrlJson<JwtHeader>(headerB64);
    const payload = decodeBase64UrlJson<Record<string, unknown>>(payloadB64);

    if (!header || !payload || header.alg !== 'RS256') {
      throw new Error('Unauthorized: LTI ID token must use RS256 signing.');
    }

    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = Buffer.from(sigB64, 'base64url');

    if (this.platformPublicKeyPem) {
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(signingInput);
      verifier.end();
      const keyObj = crypto.createPublicKey(this.platformPublicKeyPem);
      if (!verifier.verify(keyObj, signature)) {
        throw new Error('Unauthorized: Invalid LTI ID token signature.');
      }
      return payload;
    }

    const candidateKeys = await this.getVerificationKeys(header.kid);
    for (const jwk of candidateKeys) {
      try {
        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(signingInput);
        verifier.end();
        const keyObj = crypto.createPublicKey({
          key: jwk as crypto.JsonWebKey,
          format: 'jwk',
        });
        if (verifier.verify(keyObj, signature)) {
          return payload;
        }
      } catch {
        // Continue trying candidate keys
      }
    }

    throw new Error('Unauthorized: Invalid LTI ID token signature.');
  }

  private async getVerificationKeys(kid?: string): Promise<Array<Record<string, unknown>>> {
    let keys: Array<Record<string, unknown>> = [];

    if (this.platformJwks && this.platformJwks.length > 0) {
      keys = this.platformJwks;
    } else if (this.platformJwksUrl) {
      keys = await this.fetchPlatformJwks(false);
      if (kid && !keys.some((k) => k.kid === kid)) {
        keys = await this.fetchPlatformJwks(true);
      }
    }

    if (kid) {
      const byKid = keys.filter((k) => k.kid === kid);
      if (byKid.length > 0) {
        return byKid;
      }
    }
    return keys.filter((k) => k.kty === 'RSA');
  }

  private async fetchPlatformJwks(forceRefresh: boolean): Promise<Array<Record<string, unknown>>> {
    if (!this.platformJwksUrl) return [];

    const now = Date.now();
    if (!forceRefresh && this.cachedRemoteJwks.length > 0 && now < this.cachedRemoteJwksExpiresAt) {
      return this.cachedRemoteJwks;
    }

    const res = await this.fetchFn(this.platformJwksUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Unauthorized: Failed to fetch platform JWKS (HTTP ${res.status}).`);
    }

    const data = (await res.json()) as { keys?: Array<Record<string, unknown>> };
    const keys = Array.isArray(data.keys) ? data.keys : [];
    this.cachedRemoteJwks = keys;
    this.cachedRemoteJwksExpiresAt = now + this.jwksTtlMs;
    return keys;
  }

  private pruneExpiredEntries(now: number): void {
    for (const [state, entry] of this.pendingStates.entries()) {
      if (entry.expiresAt <= now) {
        this.pendingStates.delete(state);
      }
    }
    for (const [token, session] of this.activeLaunchSessions.entries()) {
      if (session.expiresAt <= now) {
        this.activeLaunchSessions.delete(token);
      }
    }
  }
}
