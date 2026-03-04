import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

const requireAuthMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/src/server/api/auth", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/src/server/api/neon", () => ({
  neonServer: { from: fromMock },
  neonServerDiagnostics: { configured: false },
}));

const makeAuthOk = (userId = "11111111-1111-1111-1111-111111111111") => ({
  ok: true as const,
  auth: { token: "token", userId },
});

describe("/api/content route", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAuthMock.mockReset();
    fromMock.mockReset();
  });

  it("returns auth failure responses from requireAuth", async () => {
    requireAuthMock.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const { GET } = await import("@/app/api/content/route");
    const response = await GET(new Request("http://localhost/api/content"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
  });

  it("scopes GET by authenticated owner id", async () => {
    requireAuthMock.mockResolvedValue(makeAuthOk());
    const eqMock = vi.fn().mockReturnThis();
    const orderMock = vi.fn().mockReturnThis();
    const queryResult = Promise.resolve({ data: [], error: null });
    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: eqMock,
      order: orderMock,
      then: queryResult.then.bind(queryResult),
    };
    fromMock.mockReturnValue(queryBuilder);

    const { GET } = await import("@/app/api/content/route");
    const response = await GET(new Request("http://localhost/api/content"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ data: { topics: [] } });
    expect(eqMock).toHaveBeenCalledWith(
      "owner_id",
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("writes owner_id from auth context on POST", async () => {
    requireAuthMock.mockResolvedValue(
      makeAuthOk("22222222-2222-2222-2222-222222222222"),
    );
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        title: "Topic",
        topic: {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          title: "Topic",
          folder: "",
          concepts: [{ id: "1", text: "", derivatives: [] }],
        },
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      error: null,
    });
    const insertMock = vi.fn().mockReturnThis();
    const selectMock = vi.fn().mockReturnThis();
    fromMock.mockReturnValue({
      insert: insertMock,
      select: selectMock,
      single: singleMock,
    });

    const { POST } = await import("@/app/api/content/route");
    const response = await POST(
      new Request("http://localhost/api/content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Topic",
          topic: {
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            title: "Topic",
            folder: "",
            concepts: [{ id: "1", text: "", derivatives: [] }],
          },
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: "22222222-2222-2222-2222-222222222222",
      }),
    );
  });

  it("scopes DELETE by authenticated owner id", async () => {
    requireAuthMock.mockResolvedValue(
      makeAuthOk("33333333-3333-3333-3333-333333333333"),
    );
    const eqMock = vi.fn().mockReturnThis();
    fromMock.mockReturnValue({ delete: vi.fn().mockReturnThis(), eq: eqMock });

    const { DELETE } = await import("@/app/api/content/route");
    const topicId = "44444444-4444-4444-4444-444444444444";
    const response = await DELETE(
      new Request(`http://localhost/api/content?id=${topicId}`, {
        method: "DELETE",
      }),
    );
    const body = await response.json();

const encode = (input: object) => Buffer.from(JSON.stringify(input)).toString('base64url');
const makeToken = (sub: string, secret: string) => {
	const header = encode({ alg: 'HS256', typ: 'JWT' });
	const payload = encode({ sub, exp: Math.floor(Date.now() / 1000) + 60 });
	const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
	return `${header}.${payload}.${signature}`;
};

describe('/api/content auth behavior', () => {
	beforeEach(() => {
		vi.resetModules();
		cookiesMock.mockReset();
		fromMock.mockReset();
		process.env.ENGRAM_SESSION_JWT_SECRET = 'session-secret';
	});

	it('returns 401 without session cookie', async () => {
		cookiesMock.mockResolvedValue({ get: () => undefined });
		const { GET } = await import('@/app/api/content/route');

		const response = await GET(new Request('http://localhost/api/content'));

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized.' });
	});


	it('returns 401 with non-uuid subject in session cookie', async () => {
		cookiesMock.mockResolvedValue({ get: () => ({ value: makeToken('neon|abc123') }) });
		const { GET } = await import('@/app/api/content/route');

		const response = await GET(new Request('http://localhost/api/content'));

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toMatchObject({ error: 'Invalid auth token.' });
	});

	it('returns 401 with unsigned session cookie', async () => {
		cookiesMock.mockResolvedValue({ get: () => ({ value: makeToken('11111111-1111-4111-8111-111111111111') }) });
		const rows = [{
			id: '22222222-2222-4222-8222-222222222222',
			title: 'Biology',
			topic: { id: 'topic', title: 'Biology', folder: '', concepts: [{ id: 'c1', text: 'Cell', derivatives: [] }] },
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T00:00:00.000Z'
		}];
		fromMock.mockReturnValue(makeQuery(rows));
		const { GET } = await import('@/app/api/content/route');

		const response = await GET(new Request('http://localhost/api/content'));

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toMatchObject({ error: 'Invalid auth token.' });
	});
});
