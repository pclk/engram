import { cookies } from 'next/headers';
import { compactVerify, createRemoteJWKSet, decodeProtectedHeader } from 'jose';
import { z } from 'zod';
import { errorResponse } from './http';

export const SESSION_COOKIE_NAME = 'engram_session';

const jwtPayloadSchema = z.object({
  sub: z.string().min(1),
  iss: z.string().min(1),
  aud: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  email: z.string().email().optional(),
  exp: z.number().optional(),
  iat: z.number().optional()
});

export type AuthContext = {
  token: string;
  userId: string;
  email?: string;
};

const bearerSchema = z.string().regex(/^Bearer\s+.+$/i, 'Invalid authorization format.');

const ALLOWED_JWT_ALGS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'EdDSA'] as const;

const verifyConfig = () => {
  const issuer = process.env.NEON_AUTH_JWT_ISSUER ?? process.env.NEON_AUTH_URL;
  const audience = process.env.NEON_AUTH_JWT_AUDIENCE;
  const jwksUrl = process.env.NEON_AUTH_JWKS_URL ?? (issuer ? `${issuer.replace(/\/$/, '')}/.well-known/jwks.json` : undefined);

  if (!issuer || !audience || !jwksUrl) {
    throw new Error('JWT verification is not configured.');
  }

  return { issuer, audience, jwksUrl };
};

const verifyJwtPayload = async (token: string): Promise<unknown> => {
  const header = decodeProtectedHeader(token);
  if (!header.alg || !ALLOWED_JWT_ALGS.includes(header.alg as (typeof ALLOWED_JWT_ALGS)[number])) {
    throw new Error('Unsupported JWT algorithm.');
  }

  const { issuer, audience, jwksUrl } = verifyConfig();
  const getKey = createRemoteJWKSet(new URL(jwksUrl));

  const verified = await compactVerify(token, getKey, {
    algorithms: [...ALLOWED_JWT_ALGS]
  });
  const decoded = new TextDecoder().decode(verified.payload);
  const payload = JSON.parse(decoded) as Record<string, unknown>;

  if (payload.iss !== issuer) {
    throw new Error('Unexpected JWT issuer.');
  }

  const aud = payload.aud;
  const audienceAllowed =
    typeof aud === 'string' ? aud === audience : Array.isArray(aud) && aud.some(candidate => candidate === audience);
  if (!audienceAllowed) {
    throw new Error('Unexpected JWT audience.');
  }

  return payload;
};

const tokenFromRequest = async (request: Request): Promise<string | null> => {
  const headerValue = request.headers.get('authorization');
  if (headerValue) {
    const parsedHeader = bearerSchema.safeParse(headerValue);
    if (!parsedHeader.success) return null;
    return parsedHeader.data.replace(/^Bearer\s+/i, '').trim();
  }

  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
};

export const requireAuth = async (request: Request): Promise<{ ok: true; auth: AuthContext } | { ok: false; response: Response }> => {
  const token = await tokenFromRequest(request);
  if (!token) {
    return { ok: false, response: errorResponse(401, 'Unauthorized.') };
  }

  let payload: unknown;
  try {
    payload = await verifyJwtPayload(token);
  } catch {
    return { ok: false, response: errorResponse(401, 'Invalid auth token.') };
  }

  const parsedPayload = jwtPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return { ok: false, response: errorResponse(401, 'Invalid auth token.', parsedPayload.error.flatten()) };
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (typeof parsedPayload.data.exp === 'number' && parsedPayload.data.exp <= nowInSeconds) {
    return { ok: false, response: errorResponse(401, 'Session expired.') };
  }

  return {
    ok: true,
    auth: {
      token,
      userId: parsedPayload.data.sub,
      email: parsedPayload.data.email
    }
  };
};
