import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE_NAME, requireAuth, verifySessionToken } from '@/src/server/api/auth';
import { errorResponse, parseJson } from '@/src/server/api/http';

const jwtStructureSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'Token must be a JWT (header.payload.signature).');

const upsertSessionSchema = z.object({
  accessToken: jwtStructureSchema
});

const bearerSchema = z.string().regex(/^Bearer\s+.+$/i, 'Invalid authorization format.');

export async function GET(request: Request) {
  const authResult = await requireAuth(request);
  if (!authResult.ok) return authResult.response;

  return Response.json({
    data: {
      userId: authResult.auth.userId,
      email: authResult.auth.email ?? null,
      authenticated: true
    }
  });
}

export async function POST(request: Request) {
  const body = await parseJson(request, upsertSessionSchema);
  if (!body.ok) return body.response;

  const authorizationHeader = request.headers.get('authorization');
  const parsedAuthorization = bearerSchema.safeParse(authorizationHeader);
  if (!parsedAuthorization.success) {
    return errorResponse(401, 'Authorization header is required to establish a session.');
  }

  const bearerToken = parsedAuthorization.data.replace(/^Bearer\s+/i, '').trim();
  if (bearerToken !== body.data.accessToken) {
    return errorResponse(401, 'Access token mismatch.');
  }

  const verification = verifySessionToken(body.data.accessToken);
  if (!verification.ok) {
    return errorResponse(401, 'Invalid auth token.');
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, body.data.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  });

  return Response.json({ data: { authenticated: true } }, { status: 201 });
}

export async function DELETE() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!existing) return errorResponse(400, 'No active session cookie.');

  cookieStore.delete(SESSION_COOKIE_NAME);
  return Response.json({ data: { authenticated: false } });
}
