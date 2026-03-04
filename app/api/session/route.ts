import { requireAuth } from '@/src/server/api/auth';

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
