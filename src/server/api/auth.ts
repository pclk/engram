import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { compactVerify, createRemoteJWKSet } from 'jose';
import { z } from 'zod';
import { errorResponse } from './http';

export const SESSION_COOKIE_NAME = 'engram_session';
const SESSION_JWT_SECRET = process.env.ENGRAM_SESSION_JWT_SECRET;

const jwtTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'Token must be a JWT (header.payload.signature).');

const jwtHeaderSchema = z.object({
  alg: z.string().min(1),
  typ: z.string().optional()
});

const jwtPayloadSchema = z.object({
  sub: z.string().uuid(),
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
const ASYMMETRIC_ALGORITHMS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'EdDSA'] as const;
const asymmetricAlgorithmSet = new Set<string>(ASYMMETRIC_ALGORITHMS);
const jwksResolverCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

const decodeBase64UrlSegment = (segment: string): string => {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
};

const decodeJwtHeader = (token: string): unknown => {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  return JSON.parse(decodeBase64UrlSegment(parts[0]));
};

const decodeJwtPayload = (token: string): unknown => {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  return JSON.parse(decodeBase64UrlSegment(parts[1]));
};

const verifyHs256Signature = (token: string): boolean => {
  if (!SESSION_JWT_SECRET) return false;

  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    const parsedHeader = z
      .object({
        alg: z.literal('HS256'),
        typ: z.string().optional()
      })
      .safeParse(JSON.parse(decodeBase64UrlSegment(encodedHeader)));
    if (!parsedHeader.success) return false;

    const expectedSignature = createHmac('sha256', SESSION_JWT_SECRET).update(`${encodedHeader}.${encodedPayload}`).digest();
    const providedSignature = Buffer.from(encodedSignature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    if (providedSignature.length !== expectedSignature.length) return false;
    return timingSafeEqual(providedSignature, expectedSignature);
  } catch {
    return false;
  }
};

const verifyPayload = (payload: unknown): VerifySessionTokenResult => {
  const parsedPayload = jwtPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) return { ok: false, reason: 'invalid' };

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (typeof parsedPayload.data.exp === 'number' && parsedPayload.data.exp <= nowInSeconds) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, payload: parsedPayload.data };
};

const verifyHs256Token = (token: string): VerifySessionTokenResult => {
  if (!verifyHs256Signature(token)) return { ok: false, reason: 'invalid' };

  let payload: unknown;
  try {
    payload = decodeJwtPayload(token);
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  return verifyPayload(payload);
};

const resolveJwksConfig = () => {
  const authUrl = process.env.NEON_AUTH_URL?.trim() || null;
  const jwksUrl = process.env.NEON_AUTH_JWKS_URL?.trim() || (authUrl ? `${authUrl.replace(/\/$/, '')}/.well-known/jwks.json` : null);
  if (!jwksUrl) return null;
  const issuer = process.env.NEON_AUTH_JWT_ISSUER?.trim() || null;
  const audience = process.env.NEON_AUTH_JWT_AUDIENCE?.trim() || null;
  return { jwksUrl, issuer, audience };
};

const getJwksResolver = (jwksUrl: string) => {
  const cached = jwksResolverCache.get(jwksUrl);
  if (cached) return cached;
  const resolver = createRemoteJWKSet(new URL(jwksUrl));
  jwksResolverCache.set(jwksUrl, resolver);
  return resolver;
};

const verifyAsymmetricToken = async (token: string, alg: (typeof ASYMMETRIC_ALGORITHMS)[number]): Promise<VerifySessionTokenResult> => {
  const config = resolveJwksConfig();
  if (!config) return { ok: false, reason: 'invalid' };

  try {
    const keyset = getJwksResolver(config.jwksUrl);
    const verified = await compactVerify(token, keyset, { algorithms: [alg] });
    const payload = JSON.parse(new TextDecoder().decode(verified.payload)) as Record<string, unknown>;

    if (config.issuer && payload.iss !== config.issuer) {
      return { ok: false, reason: 'invalid' };
    }

    if (config.audience) {
      const aud = payload.aud;
      const audienceAllowed =
        typeof aud === 'string'
          ? aud === config.audience
          : Array.isArray(aud) && aud.some(candidate => candidate === config.audience);
      if (!audienceAllowed) return { ok: false, reason: 'invalid' };
    }

    return verifyPayload(payload);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
};

type VerifySessionTokenResult =
  | { ok: true; payload: z.infer<typeof jwtPayloadSchema> }
  | { ok: false; reason: 'invalid' | 'expired' };

export const verifySessionToken = async (token: string): Promise<VerifySessionTokenResult> => {
  const parsedToken = jwtTokenSchema.safeParse(token);
  if (!parsedToken.success) return { ok: false, reason: 'invalid' };

  let header: unknown;
  try {
    header = decodeJwtHeader(parsedToken.data);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const parsedHeader = jwtHeaderSchema.safeParse(header);
  if (!parsedHeader.success) return { ok: false, reason: 'invalid' };

  if (parsedHeader.data.alg === 'HS256') {
    return verifyHs256Token(parsedToken.data);
  }

  if (asymmetricAlgorithmSet.has(parsedHeader.data.alg)) {
    return verifyAsymmetricToken(parsedToken.data, parsedHeader.data.alg as (typeof ASYMMETRIC_ALGORITHMS)[number]);
  }

  return { ok: false, reason: 'invalid' };
};

const tokenFromRequest = async (request: Request): Promise<string | null> => {
  const headerValue = request.headers.get('authorization');
  if (headerValue) {
    const parsedHeader = bearerSchema.safeParse(headerValue);
    if (parsedHeader.success) {
      return parsedHeader.data.replace(/^Bearer\s+/i, '').trim();
    }
  }

  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
};

export const requireAuth = async (request: Request): Promise<{ ok: true; auth: AuthContext } | { ok: false; response: Response }> => {
  const token = await tokenFromRequest(request);
  if (!token) {
    return { ok: false, response: errorResponse(401, 'Unauthorized.') };
  }

  const verification = await verifySessionToken(token);
  if (!verification.ok) {
    if (verification.reason === 'expired') {
      return { ok: false, response: errorResponse(401, 'Session expired.') };
    }
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
