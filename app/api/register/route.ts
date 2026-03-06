import { registerInputSchema, registerWithPassword } from '@/lib/server/auth-service';
import { serializeSession, serializeUser, setSessionCookie } from '@/src/server/api/auth';
import { errorResponse, parseJson } from '@/src/server/api/http';

export async function POST(request: Request) {
  const body = await parseJson(request, registerInputSchema);
  if (!body.ok) return body.response;

  const result = await registerWithPassword(body.data);
  if (!result.ok) return errorResponse(result.status, result.message);

  await setSessionCookie(result.token, result.session.expiresAt);

  return Response.json({
    data: {
      user: serializeUser(result.user),
      session: serializeSession(result.session)
    }
  }, { status: 201 });
}
