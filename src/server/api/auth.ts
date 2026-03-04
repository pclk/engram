import { cookies } from 'next/headers';
import { z } from 'zod';
import { errorResponse } from './http';

export const SESSION_COOKIE_NAME = 'engram_session';

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

const decodeJwtPayload = (token: string): unknown => {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const decoded = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(decoded);
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
    payload = decodeJwtPayload(token);
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
