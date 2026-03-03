import { errorResponse } from "@/src/server/api/http";

const migrationDetails = {
  deprecatedEndpoint: "/api/content/topics",
  replacementEndpoint: "/api/content",
  notes:
    "Use canonical /api/content GET/POST/PUT/DELETE and authenticated session token. Do not send userId in query/body.",
};

// Deprecated: topic CRUD has moved to the canonical `/api/content` Neon-backed endpoint.
export async function GET() {
  return errorResponse(410, "Deprecated endpoint.", migrationDetails);
}

// Deprecated: topic CRUD has moved to the canonical `/api/content` Neon-backed endpoint.
export async function POST() {
  return errorResponse(410, "Deprecated endpoint.", migrationDetails);
}
