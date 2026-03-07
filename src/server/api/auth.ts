import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '@/lib/db';
import { errorResponse } from './http';

export const SESSION_COOKIE_NAME = 'engram_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

type SessionRecord = Awaited<ReturnType<typeof getSessionByToken>>;

export type AuthContext = {
	token: string;
	userId: string;
	email: string;
	name: string;
	image: string | null;
};

export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');

const normalizeToken = (token: string | null | undefined) => {
	if (typeof token !== 'string') return null;
	const trimmed = token.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const bearerTokenFromRequest = (request: Request) => {
	const headerValue = request.headers.get('authorization');
	if (!headerValue) return null;
	const [scheme, token] = headerValue.split(/\s+/, 2);
	if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
	return normalizeToken(token);
};

export const serializeUser = (user: {
	id: string;
	email: string;
	name: string;
	image: string | null;
	createdAt: Date;
	updatedAt: Date;
}) => ({
	id: user.id,
	email: user.email,
	name: user.name,
	image: user.image,
	createdAt: user.createdAt.toISOString(),
	updatedAt: user.updatedAt.toISOString()
});

export const serializeSession = (session: {
	id: string;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
}) => ({
	id: session.id,
	expiresAt: session.expiresAt.toISOString(),
	createdAt: session.createdAt.toISOString(),
	updatedAt: session.updatedAt.toISOString()
});

export const setSessionCookie = async (token: string, expiresAt: Date) => {
	const cookieStore = await cookies();
	cookieStore.set(SESSION_COOKIE_NAME, token, {
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		path: '/',
		expires: expiresAt
	});
};

export const clearSessionCookie = async () => {
	const cookieStore = await cookies();
	cookieStore.delete(SESSION_COOKIE_NAME);
};

export const createSession = async (userId: string) => {
	const db = getDb();
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);
	const session = await db.session.create({
		data: {
			tokenHash: hashSessionToken(token),
			userId,
			expiresAt
		}
	});

	return { token, session };
};

export const getSessionByToken = async (token: string) => {
	const normalized = normalizeToken(token);
	if (!normalized) return null;

	const db = getDb();
	const session = await db.session.findUnique({
		where: { tokenHash: hashSessionToken(normalized) },
		include: { user: true }
	});
	if (!session) return null;
	if (session.expiresAt.getTime() <= Date.now()) {
		await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
		return null;
	}
	return session;
};

export const deleteSessionByToken = async (token: string) => {
	const normalized = normalizeToken(token);
	if (!normalized) return;
	await getDb().session.deleteMany({
		where: { tokenHash: hashSessionToken(normalized) }
	});
};

export const getCurrentSession = async (): Promise<SessionRecord> => {
	const cookieStore = await cookies();
	const token = normalizeToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
	if (!token) return null;
	return getSessionByToken(token);
};

const tokenFromRequest = async (request: Request): Promise<string | null> => {
	const bearerToken = bearerTokenFromRequest(request);
	if (bearerToken) return bearerToken;
	const cookieStore = await cookies();
	return normalizeToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
};

export const requireAuth = async (request: Request): Promise<{ ok: true; auth: AuthContext } | { ok: false; response: Response }> => {
	const token = await tokenFromRequest(request);
	if (!token) return { ok: false, response: errorResponse(401, 'Unauthorized.') };

	const session = await getSessionByToken(token);
	if (!session) return { ok: false, response: errorResponse(401, 'Invalid session.') };

	return {
		ok: true,
		auth: {
			token,
			userId: session.user.id,
			email: session.user.email,
			name: session.user.name,
			image: session.user.image
		}
	};
};
