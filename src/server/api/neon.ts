import 'server-only';
import { createClient } from '@neondatabase/neon-js';

const NEON_AUTH_URL = process.env.NEON_AUTH_URL;
const NEON_DATA_API_URL = process.env.NEON_DATA_API_URL;

export const neonServerDiagnostics = {
  hasAuthUrl: Boolean(NEON_AUTH_URL),
  hasDataApiUrl: Boolean(NEON_DATA_API_URL)
};

export const neonServer =
  NEON_AUTH_URL && NEON_DATA_API_URL
    ? createClient({
        auth: { url: NEON_AUTH_URL },
        dataApi: { url: NEON_DATA_API_URL }
      })
    : null;
