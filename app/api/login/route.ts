import { z } from 'zod';
import { loginInputSchema, loginWithPassword } from '@/lib/server/auth-service';
import { createSession, serializeSession, serializeUser, setSessionCookie } from '@/src/server/api/auth';
import { errorResponse, parseJson } from '@/src/server/api/http';

const loginSchema = loginInputSchema;

export async function POST(request: Request) {
  const body = await parseJson(request, loginSchema);
  if (!body.ok) return body.response;

  const result = await loginWithPassword(body.data);
  if (!result.ok) return errorResponse(result.status, result.message);

  await setSessionCookie(result.token, result.session.expiresAt);

  return Response.json({
    data: {
      user: serializeUser(result.user),
      session: serializeSession(result.session)
    }
  });
}
