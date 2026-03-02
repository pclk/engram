import { createAuthClient } from '@neondatabase/neon-js/auth';

const authUrl = import.meta.env.VITE_NEON_AUTH_URL as string;

export const authClient = createAuthClient({
	url: authUrl,
});
