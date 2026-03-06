import { z } from 'zod';
import { getDb } from '@/lib/db';
import { topicContentSchema } from '@/lib/schemas/topic';
import { requireAuth } from '@/src/server/api/auth';
import { errorResponse, parseJson } from '@/src/server/api/http';

const contentPayloadSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  topic: topicContentSchema
});

const querySchema = z.object({
  id: z.string().uuid().optional()
});

const updateSchema = contentPayloadSchema.extend({
  id: z.string().uuid()
});

const toContentRow = (row: {
  id: string;
  title: string;
  topic: unknown;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: row.id,
  title: row.title,
  topic: topicContentSchema.parse(row.topic),
  created_at: row.createdAt.toISOString(),
  updated_at: row.updatedAt.toISOString()
});

export async function GET(request: Request) {
  const authResult = await requireAuth(request);
  if (!authResult.ok) return authResult.response;

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({ id: params.get('id') ?? undefined });
  if (!parsed.success) {
    return errorResponse(400, 'Validation failed.', parsed.error.flatten());
  }

  const topics = await getDb().engramTopic.findMany({
    where: {
      ownerId: authResult.auth.userId,
      ...(parsed.data.id ? { id: parsed.data.id } : {})
    },
    orderBy: { updatedAt: 'desc' }
  });

  return Response.json({
    data: {
      topics: topics.map(toContentRow)
    }
  });
}

export async function POST(request: Request) {
  const authResult = await requireAuth(request);
  if (!authResult.ok) return authResult.response;

  const body = await parseJson(request, contentPayloadSchema);
  if (!body.ok) return body.response;

  const topic = await getDb().engramTopic.create({
    data: {
      ownerId: authResult.auth.userId,
      title: body.data.title,
      topic: body.data.topic
    }
  });

  return Response.json({ data: { topic: toContentRow(topic) } }, { status: 201 });
}

export async function PUT(request: Request) {
  const authResult = await requireAuth(request);
  if (!authResult.ok) return authResult.response;

  const body = await parseJson(request, updateSchema);
  if (!body.ok) return body.response;

  const existing = await getDb().engramTopic.findFirst({
    where: { id: body.data.id, ownerId: authResult.auth.userId }
  });
  if (!existing) return errorResponse(404, 'Content not found.');

  const topic = await getDb().engramTopic.update({
    where: { id: body.data.id },
    data: {
      title: body.data.title,
      topic: body.data.topic
    }
  });

  return Response.json({ data: { topic: toContentRow(topic) } });
}

export async function DELETE(request: Request) {
  const authResult = await requireAuth(request);
  if (!authResult.ok) return authResult.response;

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.extend({ id: z.string().uuid() }).safeParse({ id: params.get('id') ?? undefined });
  if (!parsed.success) {
    return errorResponse(400, 'Validation failed.', parsed.error.flatten());
  }

  const existing = await getDb().engramTopic.findFirst({
    where: { id: parsed.data.id, ownerId: authResult.auth.userId }
  });
  if (!existing) return errorResponse(404, 'Content not found.');

  await getDb().engramTopic.delete({ where: { id: parsed.data.id } });
  return Response.json({ data: { id: parsed.data.id, deleted: true } });
}
