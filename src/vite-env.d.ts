/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_E2E?: string;
	readonly VITE_NEON_AUTH_URL?: string;
	readonly VITE_NEON_DATA_API_URL?: string;
	readonly VITE_NEON_SCHEMA?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
