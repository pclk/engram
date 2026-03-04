import { beforeEach, describe, expect, it, vi } from 'vitest';

const decodeProtectedHeaderMock = vi.fn();
const compactVerifyMock = vi.fn();
const createRemoteJWKSetMock = vi.fn(() => vi.fn());

vi.mock('jose', () => ({
  decodeProtectedHeader: decodeProtectedHeaderMock,
  compactVerify: compactVerifyMock,
  createRemoteJWKSet: createRemoteJWKSetMock
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn()
}));

describe('requireAuth token verification', () => {
  const issuer = 'https://auth.example.test';
  const audience = 'engram-app';
  const nowInSeconds = () => Math.floor(Date.now() / 1000);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEON_AUTH_JWT_ISSUER = issuer;
    process.env.NEON_AUTH_JWT_AUDIENCE = audience;
    process.env.NEON_AUTH_JWKS_URL = `${issuer}/.well-known/jwks.json`;
  });

  const configureVerificationPayload = (payload: Record<string, unknown>) => {
    decodeProtectedHeaderMock.mockReturnValue({ alg: 'RS256' });
    compactVerifyMock.mockResolvedValue({
      payload: Buffer.from(JSON.stringify(payload), 'utf8')
    });
  };

  it('rejects forged token', async () => {
    decodeProtectedHeaderMock.mockReturnValue({ alg: 'RS256' });
    compactVerifyMock.mockRejectedValue(new Error('signature verification failed'));

    const { requireAuth } = await import('@/src/server/api/auth');
    const result = await requireAuth(
      new Request('http://localhost/api/content', {
        headers: { authorization: 'Bearer forged.token.value' }
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({ error: 'Invalid auth token.' });
    }
  });

  it('rejects expired token after verification', async () => {
    configureVerificationPayload({
      sub: 'user-1',
      iss: issuer,
      aud: audience,
      exp: nowInSeconds() - 5
    });

    const { requireAuth } = await import('@/src/server/api/auth');
    const result = await requireAuth(
      new Request('http://localhost/api/content', {
        headers: { authorization: 'Bearer signed-but-expired.token' }
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({ error: 'Session expired.' });
    }
  });

  it('accepts valid signed token', async () => {
    configureVerificationPayload({
      sub: 'user-1',
      iss: issuer,
      aud: audience,
      exp: nowInSeconds() + 300
    });

    const token = 'Bearer good.signed.token';
    const { requireAuth } = await import('@/src/server/api/auth');
    const result = await requireAuth(
      new Request('http://localhost/api/content', {
        headers: { authorization: token }
      })
    );

    expect(result).toEqual({
      ok: true,
      auth: { token: 'good.signed.token', userId: 'user-1', email: undefined }
    });
  });
});
