import { requireAuth, getCurrentSession, serializeSession, serializeUser } from '@/src/server/api/auth';

export async function GET(request: Request) {
  const authResult = await requireAuth(request);
  if (!authResult.ok) return authResult.response;

  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ data: null }, { status: 401 });
  }

  return Response.json({
    data: {
      authenticated: true,
      userId: authResult.auth.userId,
      email: authResult.auth.email,
      user: serializeUser(session.user),
      session: serializeSession(session)
    }
  });
}
