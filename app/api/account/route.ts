import { z } from 'zod';
import { getDb } from '@/lib/db';
import { requireAuth, getCurrentSession, serializeSession, serializeUser } from '@/src/server/api/auth';
import { errorResponse, parseJson } from '@/src/server/api/http';

const updateAccountSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().email().optional(),
  image: z.string().nullable().optional()
}).refine(data => Object.keys(data).length > 0, 'At least one profile field is required.');

export async function PATCH(request: Request) {
  const authResult = await requireAuth(request);
  if (!authResult.ok) return authResult.response;

  const body = await parseJson(request, updateAccountSchema);
  if (!body.ok) return body.response;

  const nextEmail = body.data.email?.trim().toLowerCase();
  if (nextEmail) {
    const existingUser = await getDb().user.findUnique({ where: { email: nextEmail } });
    if (existingUser && existingUser.id !== authResult.auth.userId) {
      return errorResponse(409, 'That email is already in use.');
    }
  }

  const user = await getDb().user.update({
    where: { id: authResult.auth.userId },
    data: {
      ...(body.data.name === undefined ? {} : { name: body.data.name.trim() }),
      ...(nextEmail === undefined ? {} : { email: nextEmail }),
      ...(body.data.image === undefined ? {} : { image: body.data.image })
    }
  });

  const session = await getCurrentSession();

  return Response.json({
    data: {
      user: serializeUser(user),
      session: session ? serializeSession(session) : null
    }
  });
}
