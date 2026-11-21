export interface CanvasOAuthConfig {
  baseUrl: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  fetchFn?: typeof fetch;
}

export interface CanvasOAuthTokenRecord {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  canvasUserId?: string;
}

/**
 * Per-user Canvas OAuth2 opt-in client for production pilot readiness (Phase 7, critique §3.1).
 */
export class CanvasOAuthClient {
  private baseUrl: string;
  private clientId?: string;
  private clientSecret?: string;
  private redirectUri?: string;
  private fetchFn: typeof fetch;
  private userTokens = new Map<string, CanvasOAuthTokenRecord>();

  constructor(config: CanvasOAuthConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.redirectUri = config.redirectUri;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  buildAuthorizeUrl(state: string): string {
    if (!this.isConfigured()) {
      throw new Error('Canvas OAuth2 is not configured.');
    }
    const url = new URL(`${this.baseUrl}/login/oauth2/auth`);
    url.searchParams.set('client_id', this.clientId!);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.redirectUri!);
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<CanvasOAuthTokenRecord> {
    if (!this.isConfigured()) {
      throw new Error('Canvas OAuth2 is not configured.');
    }
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId!,
      client_secret: this.clientSecret!,
      redirect_uri: this.redirectUri!,
      code,
    });

    const res = await this.fetchFn(`${this.baseUrl}/login/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`Canvas OAuth2 token exchange failed (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      user?: { id?: string | number };
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
      canvasUserId: data.user?.id !== undefined ? String(data.user.id) : undefined,
    };
  }

  setUserToken(userId: string, token: CanvasOAuthTokenRecord): void {
    this.userTokens.set(userId, token);
  }

  getUserToken(userId: string): CanvasOAuthTokenRecord | undefined {
    return this.userTokens.get(userId);
  }

  clearUserToken(userId: string): boolean {
    return this.userTokens.delete(userId);
  }
}
