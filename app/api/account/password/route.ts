import { z } from 'zod';
import { getDb } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/server/password';
import { hashSessionToken, requireAuth } from '@/src/server/api/auth';
import { errorResponse, parseJson } from '@/src/server/api/http';

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
  revokeOtherSessions: z.boolean().optional().default(false)
});

export async function POST(request: Request) {
  const authResult = await requireAuth(request);
  if (!authResult.ok) return authResult.response;

  const body = await parseJson(request, updatePasswordSchema);
  if (!body.ok) return body.response;

  const user = await getDb().user.findUnique({ where: { id: authResult.auth.userId } });
  if (!user) return errorResponse(404, 'User not found.');

  const validPassword = await verifyPassword(body.data.currentPassword, user.passwordHash);
  if (!validPassword) return errorResponse(401, 'Current password is incorrect.');

  const passwordHash = await hashPassword(body.data.newPassword);
  await getDb().user.update({
    where: { id: user.id },
    data: { passwordHash }
  });

  if (body.data.revokeOtherSessions) {
    await getDb().session.deleteMany({
      where: {
        userId: user.id,
        NOT: { tokenHash: hashSessionToken(authResult.auth.token) }
      }
    });
  }

  return Response.json({ data: { success: true } });
}
