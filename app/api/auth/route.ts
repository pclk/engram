import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE_NAME, clearSessionCookie, deleteSessionByToken, getSessionByToken, getSessionFromRequest, requireAuth, setSessionCookie, serializeSession, serializeUser } from '@/src/server/api/auth';
import { errorResponse, parseJson } from '@/src/server/api/http';

const upsertSessionSchema = z.object({
  sessionToken: z.string().min(1)
});

export async function GET(request: Request) {
  const authResult = await requireAuth(request);
  if (!authResult.ok) return authResult.response;

  const session = await getSessionFromRequest(request);
  if (!session) return errorResponse(401, 'Invalid session.');

  return Response.json({
    data: {
      authenticated: true,
      userId: session.user.id,
      email: session.user.email,
      user: serializeUser(session.user),
      session: serializeSession(session)
    }
  });
}

export async function POST(request: Request) {
  const body = await parseJson(request, upsertSessionSchema);
  if (!body.ok) return body.response;

  const session = await getSessionByToken(body.data.sessionToken);
  if (!session) return errorResponse(401, 'Invalid session.');

  await setSessionCookie(body.data.sessionToken, session.expiresAt);
  return Response.json({
    data: {
      authenticated: true,
      user: serializeUser(session.user),
      session: serializeSession(session)
    }
  }, { status: 201 });
}

export async function DELETE() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  if (token) await deleteSessionByToken(token);

  await clearSessionCookie();
  return Response.json({ data: { authenticated: false } });
}
