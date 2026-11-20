import crypto from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { CloudflareAccessVerifier } from './cf-access.js';

function base64UrlEncode(data: unknown): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

function signJwt(
  payload: Record<string, unknown>,
  privateKey: crypto.KeyObject,
  header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT', kid: 'key-1' },
): string {
  const headerB64 = base64UrlEncode(header);
  const payloadB64 = base64UrlEncode(payload);
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${headerB64}.${payloadB64}`), privateKey);
  return `${headerB64}.${payloadB64}.${signature.toString('base64url')}`;
}

describe('CloudflareAccessVerifier', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const publicJwk = {
    ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
    kid: 'key-1',
    alg: 'RS256',
    use: 'sig',
  };

  it('verifies valid RS256 Cloudflare Access JWTs and caches JWKS responses', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 }),
    );

    const verifier = new CloudflareAccessVerifier({
      teamDomain: 'https://sdi-demo.cloudflareaccess.com/',
      aud: 'expected-aud-tag',
      invitedEmails: ['evaluator@sdi.edu'],
      allowUnverifiedInDev: false,
      fetchFn: fetchSpy,
    });

    const now = Math.floor(Date.now() / 1000);
    const validJwt = signJwt(
      {
        aud: ['expected-aud-tag'],
        email: 'evaluator@sdi.edu',
        nbf: now - 30,
        exp: now + 300,
      },
      privateKey,
    );

    expect(await verifier.verifyHeaders('evaluator@sdi.edu', validJwt)).toBe(true);
    expect(await verifier.verifyHeaders('evaluator@sdi.edu', validJwt)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://sdi-demo.cloudflareaccess.com/cdn-cgi/access/certs');
  });

  it('rejects tampered signatures, expired tokens, wrong audience, email mismatch, and uninvited emails', async () => {
    const { privateKey: wrongPrivKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 }),
    );

    const verifier = new CloudflareAccessVerifier({
      teamDomain: 'sdi-demo.cloudflareaccess.com',
      aud: 'expected-aud-tag',
      invitedEmails: ['evaluator@sdi.edu'],
      allowUnverifiedInDev: false,
      fetchFn: fetchSpy,
    });

    const now = Math.floor(Date.now() / 1000);

    // Wrong signature
    const badSigJwt = signJwt(
      { aud: 'expected-aud-tag', email: 'evaluator@sdi.edu', exp: now + 300 },
      wrongPrivKey,
    );
    expect(await verifier.verifyHeaders('evaluator@sdi.edu', badSigJwt)).toBe(false);

    // Expired
    const expiredJwt = signJwt(
      { aud: 'expected-aud-tag', email: 'evaluator@sdi.edu', exp: now - 10 },
      privateKey,
    );
    expect(await verifier.verifyHeaders('evaluator@sdi.edu', expiredJwt)).toBe(false);

    // Wrong aud
    const wrongAudJwt = signJwt(
      { aud: 'other-aud', email: 'evaluator@sdi.edu', exp: now + 300 },
      privateKey,
    );
    expect(await verifier.verifyHeaders('evaluator@sdi.edu', wrongAudJwt)).toBe(false);

    // Header email mismatch
    const mismatchJwt = signJwt(
      { aud: 'expected-aud-tag', email: 'other@sdi.edu', exp: now + 300 },
      privateKey,
    );
    expect(await verifier.verifyHeaders('evaluator@sdi.edu', mismatchJwt)).toBe(false);

    // Uninvited email
    expect(await verifier.verifyHeaders('outsider@evil.com', mismatchJwt)).toBe(false);
  });

  it('fails closed in production when JWKS/AUD config is missing, but allows dev fallback', async () => {
    const devVerifier = new CloudflareAccessVerifier({
      invitedEmails: ['evaluator@sdi.edu'],
      allowUnverifiedInDev: true,
    });
    expect(await devVerifier.verifyHeaders('evaluator@sdi.edu', 'dev-stub-jwt')).toBe(true);

    const prodVerifier = new CloudflareAccessVerifier({
      invitedEmails: ['evaluator@sdi.edu'],
      allowUnverifiedInDev: false,
    });
    expect(await prodVerifier.verifyHeaders('evaluator@sdi.edu', 'dev-stub-jwt')).toBe(false);
  });
});
