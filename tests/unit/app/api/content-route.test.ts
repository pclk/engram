import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookiesMock = vi.fn();

vi.mock('next/headers', () => ({
	cookies: cookiesMock
}));

const makeQuery = (result: unknown[]) => {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		order: vi.fn(() => query),
		then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
			Promise.resolve({ data: result, error: null }).then(resolve)
	};
	return query;
};

const fromMock = vi.fn();

vi.mock('@/src/server/api/neon', () => ({
	neonServerDiagnostics: null,
	neonServer: {
		from: fromMock
	}
}));

const encode = (input: object) => Buffer.from(JSON.stringify(input)).toString('base64url');
const makeToken = (sub: string) => `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub })}.sig`;

describe('/api/content auth behavior', () => {
	beforeEach(() => {
		cookiesMock.mockReset();
		fromMock.mockReset();
	});

	it('returns 401 without session cookie', async () => {
		cookiesMock.mockResolvedValue({ get: () => undefined });
		const { GET } = await import('@/app/api/content/route');

		const response = await GET(new Request('http://localhost/api/content'));

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized.' });
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
