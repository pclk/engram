import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('next/headers', () => ({
  cookies: vi.fn()
}));

const encode = (input: object) => Buffer.from(JSON.stringify(input)).toString('base64url');

const signJwt = ({
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

describe('requireAuth token verification', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ENGRAM_SESSION_JWT_SECRET = 'session-secret';
  });

  it('rejects forged token', async () => {
    const token = signJwt({
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
  });

  it('rejects expired token', async () => {
    const token = signJwt({
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

  it('accepts valid signed token', async () => {
    const token = signJwt({
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
  });
});
