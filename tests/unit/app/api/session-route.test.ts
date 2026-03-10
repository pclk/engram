import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuthMock = vi.fn();
const getSessionFromRequestMock = vi.fn();

vi.mock('@/src/server/api/auth', () => ({
  getSessionFromRequest: getSessionFromRequestMock,
  requireAuth: requireAuthMock,
  serializeUser: vi.fn((user: any) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  })),
  serializeSession: vi.fn((session: any) => ({
    id: session.id,
    expiresAt: session.expiresAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  }))
}));

describe('/api/session GET', () => {
  beforeEach(() => {
    vi.resetModules();
    requireAuthMock.mockReset();
    getSessionFromRequestMock.mockReset();
  });

  it('returns authenticated session data for bearer-only requests', async () => {
    requireAuthMock.mockResolvedValue({
      ok: true,
      auth: {
        token: 'bearer-token',
        userId: '11111111-1111-1111-1111-111111111111',
        email: 'bearer@example.com'
      }
    });

    getSessionFromRequestMock.mockResolvedValue({
      id: 'sess_123',
      expiresAt: new Date('2026-01-02T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T01:00:00.000Z'),
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'bearer@example.com',
        name: 'Bearer User',
        image: null,
        createdAt: new Date('2025-12-31T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      }
    });

    const { GET } = await import('@/app/api/session/route');
    const request = new Request('http://localhost/api/session', {
      headers: { authorization: 'Bearer bearer-token' }
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        authenticated: true,
        userId: '11111111-1111-1111-1111-111111111111',
        email: 'bearer@example.com'
      }
    });
    expect(getSessionFromRequestMock).toHaveBeenCalledWith(request);
  });
});
