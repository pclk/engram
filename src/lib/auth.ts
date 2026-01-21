import { createClient } from '@neondatabase/neon-js';

const authUrl = import.meta.env.VITE_NEON_AUTH_URL as string;
const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL as string;

export const neon = createClient({
	auth: {
		url: authUrl,
	},
	dataApi: {
		url: dataApiUrl,
	},
});

export const authClient = neon.auth;
