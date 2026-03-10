import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuthMock = vi.fn();
const getSessionFromRequestMock = vi.fn();
const getDbMock = vi.fn();

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

vi.mock('@/lib/db', () => ({
  getDb: getDbMock
}));

describe('/api/account PATCH', () => {
  const findUniqueMock = vi.fn();
  const updateMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    requireAuthMock.mockReset();
    getSessionFromRequestMock.mockReset();
    getDbMock.mockReset();
    findUniqueMock.mockReset();
    updateMock.mockReset();

    getDbMock.mockReturnValue({
      user: {
        findUnique: findUniqueMock,
        update: updateMock
      }
    });
  });

  it('returns updated user + session for bearer-only requests', async () => {
    requireAuthMock.mockResolvedValue({
      ok: true,
      auth: {
        token: 'bearer-token',
        userId: '11111111-1111-1111-1111-111111111111',
        email: 'bearer@example.com'
      }
    });
    findUniqueMock.mockResolvedValue(null);
    updateMock.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'new@example.com',
      name: 'New Name',
      image: 'https://example.com/new.png',
      createdAt: new Date('2025-12-31T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    });
    getSessionFromRequestMock.mockResolvedValue({
      id: 'sess_123',
      expiresAt: new Date('2026-01-02T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T01:00:00.000Z')
    });

    const { PATCH } = await import('@/app/api/account/route');
    const request = new Request('http://localhost/api/account', {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer bearer-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        name: ' New Name ',
        email: 'NEW@EXAMPLE.COM',
        image: 'https://example.com/new.png'
      })
    });

    const response = await PATCH(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        user: {
          id: '11111111-1111-1111-1111-111111111111',
          email: 'new@example.com',
          name: 'New Name',
          image: 'https://example.com/new.png',
          createdAt: '2025-12-31T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        },
        session: {
          id: 'sess_123',
          expiresAt: '2026-01-02T00:00:00.000Z',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T01:00:00.000Z'
        }
      }
    });
    expect(getSessionFromRequestMock).toHaveBeenCalledWith(request);
  });
});
