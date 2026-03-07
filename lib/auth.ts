'use client';

type AuthUser = {
	id: string;
	email: string;
	name: string;
	image: string | null;
	createdAt: string;
	updatedAt: string;
};

type AuthSession = {
	id: string;
	expiresAt: string;
	createdAt: string;
	updatedAt: string;
};

type SessionPayload = {
	user: AuthUser;
	session: AuthSession;
};

type AuthError = {
	message: string;
	status: number;
};

type AuthResponse<T> = {
	data: T | null;
	error: AuthError | null;
};

type Listener = (event: string, payload: SessionPayload | null) => void;

const listeners = new Set<Listener>();

const emitAuthEvent = (event: string, payload: SessionPayload | null) => {
	for (const listener of listeners) listener(event, payload);
};

const parseError = async (response: Response): Promise<AuthError> => {
	try {
		const body = (await response.json()) as { error?: unknown };
		if (typeof body?.error === 'string' && body.error.trim().length > 0) {
			return { message: body.error.trim(), status: response.status };
		}
	} catch {}
	return { message: `Request failed with status ${response.status}.`, status: response.status };
};

const requestAuth = async <T>(path: string, init?: RequestInit): Promise<AuthResponse<T>> => {
	const response = await fetch(path, {
		...init,
		credentials: 'include',
		headers: {
			Accept: 'application/json',
			...(init?.body ? { 'Content-Type': 'application/json' } : {}),
			...(init?.headers ?? {})
		}
	});

	if (!response.ok) {
		return {
			data: null,
			error: await parseError(response)
		};
	}

	const body = (await response.json()) as { data?: T };
	return {
		data: body.data ?? null,
		error: null
	};
};

const withThrow = async <T>(promise: Promise<AuthResponse<T>>, shouldThrow?: boolean) => {
	const result = await promise;
	if (shouldThrow && result.error) {
		const error = new Error(result.error.message) as Error & { status?: number };
		error.status = result.error.status;
		throw error;
	}
	return result;
};

const normalizeSessionResponse = (result: AuthResponse<SessionPayload>) => {
	if (result.error) return { data: null, error: result.error };
	return { data: result.data, error: null };
};

export const authClient = {
	getSession: async () => {
		const result = await requestAuth<{
			user: AuthUser;
			session: AuthSession;
			authenticated: boolean;
			userId: string;
			email: string;
		}>('/api/session');
		if (result.error) return { data: null, error: result.error };
		if (!result.data) return { data: null, error: null };
		return {
			data: {
				user: result.data.user,
				session: result.data.session
			},
			error: null
		};
	},
	onAuthStateChange: (listener: Listener) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
	signIn: {
		email: async (payload: { email: string; password: string; fetchOptions?: { throw?: boolean } }) => {
			const result = await withThrow(
				requestAuth<SessionPayload>('/api/login', {
					method: 'POST',
					body: JSON.stringify({
						email: payload.email,
						password: payload.password
					})
				}),
				payload.fetchOptions?.throw
			);
			const normalized = normalizeSessionResponse(result);
			if (normalized.data) emitAuthEvent('SIGN_IN', normalized.data);
			return normalized;
		}
	},
	signUp: {
		email: async (payload: { name: string; email: string; password: string; fetchOptions?: { throw?: boolean } }) => {
			const result = await withThrow(
				requestAuth<SessionPayload>('/api/register', {
					method: 'POST',
					body: JSON.stringify({
						name: payload.name,
						email: payload.email,
						password: payload.password
					})
				}),
				payload.fetchOptions?.throw
			);
			const normalized = normalizeSessionResponse(result);
			if (normalized.data) emitAuthEvent('SIGN_IN', normalized.data);
			return normalized;
		}
	},
	signOut: async (payload?: { fetchOptions?: { throw?: boolean } }) => {
		const result = await withThrow(
			requestAuth<{ authenticated: boolean }>('/api/auth', {
				method: 'DELETE'
			}),
			payload?.fetchOptions?.throw
		);
		if (!result.error) emitAuthEvent('SIGN_OUT', null);
		return result;
	},
	updateUser: async (payload: { name?: string; email?: string; image?: string | null; fetchOptions?: { throw?: boolean } }) => {
		const result = await withThrow(
			requestAuth<{ user: AuthUser; session: AuthSession | null }>('/api/account', {
				method: 'PATCH',
				body: JSON.stringify({
					...(payload.name === undefined ? {} : { name: payload.name }),
					...(payload.email === undefined ? {} : { email: payload.email }),
					...(payload.image === undefined ? {} : { image: payload.image })
				})
			}),
			payload.fetchOptions?.throw
		);
		if (result.error || !result.data?.user || !result.data.session) return result;
		emitAuthEvent('USER_UPDATE', {
			user: result.data.user,
			session: result.data.session
		});
		return result;
	},
	changePassword: async (payload: {
		currentPassword: string;
		newPassword: string;
		revokeOtherSessions?: boolean;
		fetchOptions?: { throw?: boolean };
	}) => withThrow(
		requestAuth<{ success: boolean }>('/api/account/password', {
			method: 'POST',
			body: JSON.stringify({
				currentPassword: payload.currentPassword,
				newPassword: payload.newPassword,
				revokeOtherSessions: payload.revokeOtherSessions ?? false
			})
		}),
		payload.fetchOptions?.throw
	)
};

export const neonConfigDiagnostics = {
	isConfigured: true,
	missingKeys: [] as string[]
};

export const getAuthClientOrThrow = () => authClient;
