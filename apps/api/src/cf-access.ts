import crypto from 'node:crypto';

export interface CloudflareAccessVerifierOptions {
  teamDomain?: string;
  aud?: string;
  invitedEmails: string[];
  allowUnverifiedInDev: boolean;
  fetchFn?: typeof fetch;
  jwksTtlMs?: number;
}

interface JwkRecord {
  kid?: string;
  kty?: string;
  [key: string]: unknown;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
}

interface JwtPayload {
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  email?: string;
}

function decodeBase64UrlJson<T>(segment: string): T | null {
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Verifies Cloudflare Access headers (`cf-access-authenticated-user-email` and
 * `cf-access-jwt-assertion`) against Cloudflare Access JWKS public keys when configured.
 */
export class CloudflareAccessVerifier {
  private teamDomain?: string;
  private aud?: string;
  private invitedEmails: string[];
  private allowUnverifiedInDev: boolean;
  private fetchFn: typeof fetch;
  private jwksTtlMs: number;
  private cachedKeys: JwkRecord[] = [];
  private cacheExpiresAt = 0;

  constructor(options: CloudflareAccessVerifierOptions) {
    this.teamDomain = options.teamDomain
      ? options.teamDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
      : undefined;
    this.aud = options.aud;
    this.invitedEmails = options.invitedEmails.map((e) => e.trim().toLowerCase());
    this.allowUnverifiedInDev = options.allowUnverifiedInDev;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.jwksTtlMs = options.jwksTtlMs ?? 5 * 60_000;
  }

  private isEmailInvited(emailLower: string): boolean {
    return this.invitedEmails.length === 0 || this.invitedEmails.includes(emailLower);
  }

  private async getJwks(forceRefresh = false): Promise<JwkRecord[]> {
    if (!this.teamDomain) return [];

    if (!forceRefresh && this.cachedKeys.length > 0 && Date.now() < this.cacheExpiresAt) {
      return this.cachedKeys;
    }

    const res = await this.fetchFn(`https://${this.teamDomain}/cdn-cgi/access/certs`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch Cloudflare Access JWKS: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { keys?: JwkRecord[] };
    const keys = Array.isArray(data.keys) ? data.keys : [];
    this.cachedKeys = keys;
    this.cacheExpiresAt = Date.now() + this.jwksTtlMs;
    return keys;
  }

  async verifyHeaders(emailHeader: unknown, jwtHeader: unknown): Promise<boolean> {
    if (
      typeof emailHeader !== 'string' ||
      emailHeader.trim().length === 0 ||
      typeof jwtHeader !== 'string' ||
      jwtHeader.trim().length === 0
    ) {
      return false;
    }

    const emailLower = emailHeader.trim().toLowerCase();
    if (!this.isEmailInvited(emailLower)) {
      return false;
    }

    // Without configured Cloudflare Access JWKS/AUD, only allow in explicit non-production dev/test mode.
    if (!this.teamDomain || !this.aud) {
      return this.allowUnverifiedInDev;
    }

    const parts = jwtHeader.trim().split('.');
    if (parts.length !== 3) {
      return false;
    }

    const [headerB64, payloadB64, sigB64] = parts;
    const header = decodeBase64UrlJson<JwtHeader>(headerB64);
    const payload = decodeBase64UrlJson<JwtPayload>(payloadB64);
    if (!header || !payload || header.alg !== 'RS256' || !header.kid) {
      return false;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
      return false;
    }
    if (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || payload.nbf > nowSec)) {
      return false;
    }

    const audValid = Array.isArray(payload.aud)
      ? payload.aud.includes(this.aud)
      : payload.aud === this.aud;
    if (!audValid) {
      return false;
    }

    if (typeof payload.email !== 'string' || payload.email.trim().toLowerCase() !== emailLower) {
      return false;
    }

    try {
      let keys = await this.getJwks(false);
      let jwk = keys.find((k) => k.kid === header.kid);
      if (!jwk) {
        keys = await this.getJwks(true);
        jwk = keys.find((k) => k.kid === header.kid);
      }
      if (!jwk) {
        return false;
      }

      const publicKey = crypto.createPublicKey({
        key: jwk as crypto.JsonWebKey,
        format: 'jwk',
      });
      const signature = Buffer.from(sigB64, 'base64url');
      return crypto.verify('RSA-SHA256', Buffer.from(`${headerB64}.${payloadB64}`), publicKey, signature);
    } catch {
      return false;
    }
  }
}
