import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE_NAME, requireAuth } from '@/src/server/api/auth';
import { errorResponse, parseJson } from '@/src/server/api/http';

const upsertSessionSchema = z.object({
  accessToken: z.string().min(20)
});

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
