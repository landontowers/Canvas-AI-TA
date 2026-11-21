import { describe, it, expect, vi } from 'vitest';
import { CanvasOAuthClient } from './canvas-oauth.js';

describe('CanvasOAuthClient', () => {
  it('builds authorize URL, exchanges code for token, and manages per-user tokens', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'canvas-user-tok-123',
          refresh_token: 'canvas-refresh-456',
          expires_in: 3600,
          user: { id: 1001 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const oauth = new CanvasOAuthClient({
      baseUrl: 'https://classroom.sdi.edu',
      clientId: 'oauth-client-1',
      clientSecret: 'oauth-secret-1',
      redirectUri: 'https://ta.example.edu/api/oauth/canvas/callback',
      fetchFn: mockFetch,
    });

    expect(oauth.isConfigured()).toBe(true);
    const authUrl = oauth.buildAuthorizeUrl('state_abc');
    expect(authUrl).toContain('https://classroom.sdi.edu/login/oauth2/auth');
    expect(authUrl).toContain('state=state_abc');

    const token = await oauth.exchangeCode('auth_code_xyz');
    expect(token.accessToken).toBe('canvas-user-tok-123');
    expect(token.canvasUserId).toBe('1001');

    oauth.setUserToken('user-1001', token);
    expect(oauth.getUserToken('user-1001')?.accessToken).toBe('canvas-user-tok-123');
    expect(oauth.clearUserToken('user-1001')).toBe(true);
    expect(oauth.getUserToken('user-1001')).toBeUndefined();
  });
});
