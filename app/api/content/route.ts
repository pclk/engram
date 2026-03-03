import { z } from "zod";
import { errorResponse, parseJson } from "@/src/server/api/http";
import { requireAuth } from "@/src/server/api/auth";
import { neonServer, neonServerDiagnostics } from "@/src/server/api/neon";

// Canonical topic CRUD endpoint. Legacy `/api/content/topics/*` Prisma routes are deprecated.

const contentPayloadSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  topic: z.record(z.string(), z.unknown()),
});

const querySchema = z.object({
  id: z.string().uuid().optional(),
});

const updateSchema = topicSchema.extend({
  id: z.string().uuid(),
});

const withAuth = async (request: Request) => {
  const authResult = await requireAuth(request);
  if (!authResult.ok) return authResult;
  return authResult;
};

const guardNeon = () => {
  if (!neonServer) {
    return errorResponse(
      503,
      "Content backend is not configured.",
      neonServerDiagnostics,
    );
  }
  return null;
};

export async function GET(request: Request) {
  const authResult = await withAuth(request);
  if (!authResult.ok) return authResult.response;

  const neonError = guardNeon();
  if (neonError) return neonError;

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({ id: params.get("id") ?? undefined });
  if (!parsed.success) {
    return errorResponse(400, "Validation failed.", parsed.error.flatten());
  }

  const query = neonServer!
    .from("engram_topics")
    .select("id, title, topic, created_at, updated_at")
    .eq("owner_id", authResult.auth.userId)
    .order("updated_at", { ascending: false });

  const scopedQuery = parsed.data.id ? query.eq("id", parsed.data.id) : query;
  const { data, error } = await scopedQuery;

  if (error) {
    return errorResponse(500, "Failed to fetch content.", error.message);
  }

  return Response.json({ data: { topics: data ?? [] } });
}

export async function POST(request: Request) {
  const authResult = await withAuth(request);
  if (!authResult.ok) return authResult.response;

  const neonError = guardNeon();
  if (neonError) return neonError;

  const body = await parseJson(request, contentPayloadSchema);
  if (!body.ok) return body.response;

  const { data, error } = await neonServer!
    .from("engram_topics")
    .insert({
      owner_id: authResult.auth.userId,
      title: body.data.title,
      topic: body.data.topic,
    })
    .select("id, title, topic, created_at, updated_at")
    .single();

  if (error) {
    return errorResponse(500, "Failed to create content.", error.message);
  }

  return Response.json({ data: { topic: data } }, { status: 201 });
}

export async function PUT(request: Request) {
  const authResult = await withAuth(request);
  if (!authResult.ok) return authResult.response;

  const neonError = guardNeon();
  if (neonError) return neonError;

  const body = await parseJson(request, updateSchema);
  if (!body.ok) return body.response;

  const { data, error } = await neonServer!
    .from("engram_topics")
    .update({ title: body.data.title, topic: body.data.topic })
    .eq("id", body.data.id)
    .eq("owner_id", authResult.auth.userId)
    .select("id, title, topic, created_at, updated_at")
    .single();

  if (error) {
    return errorResponse(500, "Failed to update content.", error.message);
  }

  return Response.json({ data: { topic: data } });
}

export async function DELETE(request: Request) {
  const authResult = await withAuth(request);
  if (!authResult.ok) return authResult.response;

  const neonError = guardNeon();
  if (neonError) return neonError;

  const params = new URL(request.url).searchParams;
  const parsed = querySchema
    .extend({ id: z.string().uuid() })
    .safeParse({ id: params.get("id") ?? undefined });
  if (!parsed.success) {
    return errorResponse(400, "Validation failed.", parsed.error.flatten());
  }

  const { error } = await neonServer!
    .from("engram_topics")
    .delete()
    .eq("id", parsed.data.id)
    .eq("owner_id", authResult.auth.userId);

  if (error) {
    return errorResponse(500, "Failed to delete content.", error.message);
  }

  return Response.json({ data: { id: parsed.data.id, deleted: true } });
}
