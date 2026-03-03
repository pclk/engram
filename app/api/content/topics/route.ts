import { errorResponse } from "@/src/server/api/http";

// Deprecated: topic CRUD has moved to the canonical `/api/content` Neon-backed endpoint.
export async function GET() {
  return errorResponse(410, "Deprecated endpoint. Use /api/content.");
}

// Deprecated: topic CRUD has moved to the canonical `/api/content` Neon-backed endpoint.
export async function POST() {
  return errorResponse(410, "Deprecated endpoint. Use /api/content.");
}
