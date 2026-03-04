import { cookies } from 'next/headers';
<<<<<<< HEAD
import { compactVerify, createRemoteJWKSet, decodeProtectedHeader } from 'jose';
=======
import { createHmac, timingSafeEqual } from 'node:crypto';
>>>>>>> 668aa056715d6ea11390d3dbb2838e1a03a9f83f
import { z } from 'zod';
import { errorResponse } from './http';

export const SESSION_COOKIE_NAME = 'engram_session';
const SESSION_JWT_SECRET = process.env.ENGRAM_SESSION_JWT_SECRET;

const jwtTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'Token must be a JWT (header.payload.signature).');

const jwtHeaderSchema = z.object({
  alg: z.literal('HS256'),
  typ: z.string().optional()
});

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

<<<<<<< HEAD
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
=======
const decodeBase64UrlSegment = (segment: string): string => {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
};

const decodeJwtPayload = (token: string): unknown => {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  return JSON.parse(decodeBase64UrlSegment(parts[1]));
};

const verifyJwtSignature = (token: string): boolean => {
  if (!SESSION_JWT_SECRET) return false;

  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    const parsedHeader = jwtHeaderSchema.safeParse(JSON.parse(decodeBase64UrlSegment(encodedHeader)));
    if (!parsedHeader.success) return false;

    const expectedSignature = createHmac('sha256', SESSION_JWT_SECRET).update(`${encodedHeader}.${encodedPayload}`).digest();
    const providedSignature = Buffer.from(encodedSignature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    if (providedSignature.length !== expectedSignature.length) return false;
    return timingSafeEqual(providedSignature, expectedSignature);
  } catch {
    return false;
  }
};

export const verifySessionToken = (token: string): { ok: true; payload: z.infer<typeof jwtPayloadSchema> } | { ok: false } => {
  const parsedToken = jwtTokenSchema.safeParse(token);
  if (!parsedToken.success) return { ok: false };
  if (!verifyJwtSignature(parsedToken.data)) return { ok: false };

  let payload: unknown;
  try {
    payload = decodeJwtPayload(parsedToken.data);
  } catch {
    return { ok: false };
  }

  const parsedPayload = jwtPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) return { ok: false };

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (typeof parsedPayload.data.exp === 'number' && parsedPayload.data.exp <= nowInSeconds) {
    return { ok: false };
  }

  return { ok: true, payload: parsedPayload.data };
>>>>>>> 668aa056715d6ea11390d3dbb2838e1a03a9f83f
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

<<<<<<< HEAD
  let payload: unknown;
  try {
    payload = await verifyJwtPayload(token);
  } catch {
=======
  const verification = verifySessionToken(token);
  if (!verification.ok) {
>>>>>>> 668aa056715d6ea11390d3dbb2838e1a03a9f83f
    return { ok: false, response: errorResponse(401, 'Invalid auth token.') };
  }

  return {
    ok: true,
    auth: {
      token,
      userId: verification.payload.sub,
      email: verification.payload.email
    }
  };
};
