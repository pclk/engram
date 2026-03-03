import { createClient } from '@neondatabase/neon-js';

const NEON_REQUIRED_ENV_KEYS = ['NEXT_PUBLIC_NEON_AUTH_URL', 'NEXT_PUBLIC_NEON_DATA_API_URL'] as const;

type NeonRequiredEnvKey = (typeof NEON_REQUIRED_ENV_KEYS)[number];

type NeonConfig = {
	authUrl: string;
	dataApiUrl: string;
};

export class MissingNeonConfigError extends Error {
	readonly code = 'MISSING_NEON_CONFIG';

	constructor(readonly missingKeys: NeonRequiredEnvKey[]) {
		super(`Missing required Neon environment variables: ${missingKeys.join(', ')}`);
		this.name = 'MissingNeonConfigError';
	}
}

const readEnv = (key: NeonRequiredEnvKey): string | null => {
	const value = process.env[key];
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length ? trimmed : null;
};

const resolveNeonConfig = (): { config: NeonConfig | null; missingKeys: NeonRequiredEnvKey[] } => {
	const authUrl = readEnv('NEXT_PUBLIC_NEON_AUTH_URL');
	const dataApiUrl = readEnv('NEXT_PUBLIC_NEON_DATA_API_URL');
	const missingKeys = NEON_REQUIRED_ENV_KEYS.filter(key => (key === 'NEXT_PUBLIC_NEON_AUTH_URL' ? !authUrl : !dataApiUrl));
	if (missingKeys.length > 0) return { config: null, missingKeys };
	if (!authUrl || !dataApiUrl) return { config: null, missingKeys };
	return {
		config: {
			authUrl,
			dataApiUrl
		},
		missingKeys: []
	};
};

const neonConfigResolution = resolveNeonConfig();

export const neonConfigDiagnostics = {
	isConfigured: neonConfigResolution.config !== null,
	missingKeys: neonConfigResolution.missingKeys
};

export const neon = neonConfigResolution.config
	? createClient({
		auth: {
			url: neonConfigResolution.config.authUrl
		},
		dataApi: {
			url: neonConfigResolution.config.dataApiUrl
		}
	})
	: null;

export const authClient = neon?.auth ?? null;

export const getNeonClientOrThrow = () => {
	if (!neon) throw new MissingNeonConfigError(neonConfigResolution.missingKeys);
	return neon;
};

export const getAuthClientOrThrow = () => {
	if (!authClient) throw new MissingNeonConfigError(neonConfigResolution.missingKeys);
	return authClient;
};
