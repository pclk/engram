export type AuthFetchInit = RequestInit & {
	headers?: HeadersInit;
};

export type AuthFetchOptions = {
	onUnauthorized?: () => Promise<boolean> | boolean;
};

const hasJsonBody = (body: BodyInit | null | undefined) => {
	if (!body) return false;
	return !(body instanceof FormData || body instanceof URLSearchParams || body instanceof Blob || body instanceof ArrayBuffer);
};

const normalizeHeaders = (headers?: HeadersInit) => {
	const normalized = new Headers(headers);
	if (!normalized.has('Accept')) normalized.set('Accept', 'application/json');
	return normalized;
};

const buildAuthFetchInit = (init?: AuthFetchInit): RequestInit => {
	const headers = normalizeHeaders(init?.headers);
	if (hasJsonBody(init?.body) && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}
	return {
		...init,
		credentials: 'include',
		headers
	};
};

export const authFetch = async (
	path: string,
	init?: AuthFetchInit,
	options?: AuthFetchOptions
): Promise<Response> => {
	const requestInit = buildAuthFetchInit(init);
	const response = await fetch(path, requestInit);
	if (response.status !== 401 || !options?.onUnauthorized) return response;
	const recovered = await options.onUnauthorized();
	if (!recovered) return response;
	return fetch(path, requestInit);
};
