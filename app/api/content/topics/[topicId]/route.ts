import { errorResponse } from "@/src/server/api/http";

// Deprecated: topic CRUD has moved to the canonical `/api/content` Neon-backed endpoint.
export async function DELETE() {
  return errorResponse(
    410,
    "Deprecated endpoint. Use /api/content?id={topicId}.",
  );
}
