import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

const compactVerifyMock = vi.fn();
const createRemoteJWKSetMock = vi.fn(() => vi.fn());

vi.mock('jose', () => ({
  compactVerify: compactVerifyMock,
  createRemoteJWKSet: createRemoteJWKSetMock
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn()
}));

const encode = (input: object) => Buffer.from(JSON.stringify(input)).toString('base64url');

const signHsJwt = ({
  secret,
  sub,
  email,
  exp
}: {
  secret: string;
  sub: string;
  email?: string;
  exp: number;
}) => {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub, ...(email ? { email } : {}), exp });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
};

const signUnsignedJwt = ({ alg, payload }: { alg: string; payload: Record<string, unknown> }) =>
  `${encode({ alg, typ: 'JWT' })}.${encode(payload)}.sig`;

describe('requireAuth token verification', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ENGRAM_SESSION_JWT_SECRET = 'session-secret';
    delete process.env.NEON_AUTH_URL;
    delete process.env.NEON_AUTH_JWKS_URL;
    delete process.env.NEON_AUTH_JWT_ISSUER;
    delete process.env.NEON_AUTH_JWT_AUDIENCE;
  });

  it('rejects forged HS256 token', async () => {
    const token = signHsJwt({
      secret: 'wrong-secret',
      sub: '11111111-1111-4111-8111-111111111111',
      exp: Math.floor(Date.now() / 1000) + 300
    });

    const { requireAuth } = await import('@/src/server/api/auth');
    const result = await requireAuth(
      new Request('http://localhost/api/content', {
        headers: { authorization: `Bearer ${token}` }
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({ error: 'Invalid auth token.' });
    }
    expect(compactVerifyMock).not.toHaveBeenCalled();
  });

  it('rejects expired HS256 token', async () => {
    const token = signHsJwt({
      secret: 'session-secret',
      sub: '11111111-1111-4111-8111-111111111111',
      exp: Math.floor(Date.now() / 1000) - 5
    });

    const { requireAuth } = await import('@/src/server/api/auth');
    const result = await requireAuth(
      new Request('http://localhost/api/content', {
        headers: { authorization: `Bearer ${token}` }
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({ error: 'Session expired.' });
    }
  });

  it('accepts valid HS256 token', async () => {
    const token = signHsJwt({
      secret: 'session-secret',
      sub: '11111111-1111-4111-8111-111111111111',
      email: 'user@example.com',
      exp: Math.floor(Date.now() / 1000) + 300
    });

    const { requireAuth } = await import('@/src/server/api/auth');
    const result = await requireAuth(
      new Request('http://localhost/api/content', {
        headers: { authorization: `Bearer ${token}` }
      })
    );

    expect(result).toEqual({
      ok: true,
      auth: {
        token,
        userId: '11111111-1111-4111-8111-111111111111',
        email: 'user@example.com'
      }
    });
    expect(compactVerifyMock).not.toHaveBeenCalled();
  });

  it('accepts valid RS256 token through JWKS verification', async () => {
    process.env.NEON_AUTH_URL = 'https://auth.example.test';
    process.env.NEON_AUTH_JWT_ISSUER = 'https://issuer.example.test';
    process.env.NEON_AUTH_JWT_AUDIENCE = 'engram-app';

    compactVerifyMock.mockResolvedValue({
      payload: Buffer.from(
        JSON.stringify({
          sub: '11111111-1111-4111-8111-111111111111',
          email: 'jwks@example.com',
          iss: 'https://issuer.example.test',
          aud: 'engram-app',
          exp: Math.floor(Date.now() / 1000) + 300
        }),
        'utf8'
      )
    });

    const token = signUnsignedJwt({
      alg: 'RS256',
      payload: {
        sub: '11111111-1111-4111-8111-111111111111',
        exp: Math.floor(Date.now() / 1000) + 300
      }
    });

    const { requireAuth } = await import('@/src/server/api/auth');
    const result = await requireAuth(
      new Request('http://localhost/api/content', {
        headers: { authorization: `Bearer ${token}` }
      })
    );

    expect(result).toEqual({
      ok: true,
      auth: {
        token,
        userId: '11111111-1111-4111-8111-111111111111',
        email: 'jwks@example.com'
      }
    });
    expect(createRemoteJWKSetMock).toHaveBeenCalledTimes(1);
    expect(createRemoteJWKSetMock).toHaveBeenCalledWith(new URL('https://auth.example.test/.well-known/jwks.json'));
    expect(compactVerifyMock).toHaveBeenCalledTimes(1);
  });

  it('rejects RS256 token when issuer does not match configured issuer', async () => {
    process.env.NEON_AUTH_URL = 'https://auth.example.test';
    process.env.NEON_AUTH_JWT_ISSUER = 'https://issuer.example.test';

    compactVerifyMock.mockResolvedValue({
      payload: Buffer.from(
        JSON.stringify({
          sub: '11111111-1111-4111-8111-111111111111',
          iss: 'https://unexpected-issuer.example.test',
          exp: Math.floor(Date.now() / 1000) + 300
        }),
        'utf8'
      )
    });

    const token = signUnsignedJwt({
      alg: 'RS256',
      payload: {
        sub: '11111111-1111-4111-8111-111111111111',
        exp: Math.floor(Date.now() / 1000) + 300
      }
    });

    const { requireAuth } = await import('@/src/server/api/auth');
    const result = await requireAuth(
      new Request('http://localhost/api/content', {
        headers: { authorization: `Bearer ${token}` }
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({ error: 'Invalid auth token.' });
    }
    expect(compactVerifyMock).toHaveBeenCalledTimes(1);
  });
});
