import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

const cookiesMock = vi.fn();

vi.mock('next/headers', () => ({
	cookies: cookiesMock
}));

const encode = (input: object) => Buffer.from(JSON.stringify(input)).toString('base64url');

const signJwt = ({
	secret,
	sub,
	email
}: {
	secret: string;
	sub: string;
	email?: string;
}) => {
	const header = encode({ alg: 'HS256', typ: 'JWT' });
	const payload = encode({ sub, ...(email ? { email } : {}), exp: Math.floor(Date.now() / 1000) + 300 });
	const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
	return `${header}.${payload}.${signature}`;
};

describe('/api/auth POST validation', () => {
	const cookieSet = vi.fn();
	const cookieDelete = vi.fn();

	beforeEach(() => {
		vi.resetModules();
		cookiesMock.mockReset();
		cookieSet.mockReset();
		cookieDelete.mockReset();
		cookiesMock.mockResolvedValue({
			set: cookieSet,
			get: vi.fn(),
			delete: cookieDelete
		});
		process.env.ENGRAM_SESSION_JWT_SECRET = 'session-secret';
	});

	afterEach(() => {
		delete process.env.ENGRAM_SESSION_JWT_SECRET;
	});

	it('returns 400 for invalid token format', async () => {
		const { POST } = await import('@/app/api/auth/route');

		const response = await POST(
			new Request('http://localhost/api/auth', {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: 'Bearer not-a-jwt' },
				body: JSON.stringify({ accessToken: 'not-a-jwt' })
			})
		);

		expect(response.status).toBe(400);
		expect(cookieSet).not.toHaveBeenCalled();
		await expect(response.json()).resolves.toMatchObject({ error: 'Validation failed.' });
	});

	it('returns 401 and does not set cookie for forged token', async () => {
		const { POST } = await import('@/app/api/auth/route');
		const forgedToken = signJwt({
			secret: 'wrong-secret',
			sub: '11111111-1111-4111-8111-111111111111',
			email: 'forged@example.com'
		});

		const response = await POST(
			new Request('http://localhost/api/auth', {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${forgedToken}` },
				body: JSON.stringify({ accessToken: forgedToken })
			})
		);

		expect(response.status).toBe(401);
		expect(cookieSet).not.toHaveBeenCalled();
		await expect(response.json()).resolves.toEqual({ error: 'Invalid auth token.' });
	});
});
