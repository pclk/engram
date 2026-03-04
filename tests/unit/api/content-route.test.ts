import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/src/server/api/auth", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/src/server/api/neon", () => ({
  neonServer: { from: fromMock },
  neonServerDiagnostics: { configured: false },
}));

const makeAuthOk = (userId = "11111111-1111-1111-1111-111111111111") => ({
  ok: true as const,
  auth: { token: "token", userId },
});

describe("/api/content route", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAuthMock.mockReset();
    fromMock.mockReset();
  });

  it("scopes GET by authenticated owner id", async () => {
    requireAuthMock.mockResolvedValue(makeAuthOk());
    const eqMock = vi.fn().mockReturnThis();
    const orderMock = vi.fn().mockReturnThis();
    const queryResult = Promise.resolve({ data: [], error: null });
    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: eqMock,
      order: orderMock,
      then: queryResult.then.bind(queryResult),
    };
    fromMock.mockReturnValue(queryBuilder);

    const { GET } = await import("@/app/api/content/route");
    const response = await GET(new Request("http://localhost/api/content"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ data: { topics: [] } });
    expect(eqMock).toHaveBeenCalledWith(
      "owner_id",
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("writes owner_id from auth context on POST", async () => {
    requireAuthMock.mockResolvedValue(
      makeAuthOk("22222222-2222-2222-2222-222222222222"),
    );
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        title: "Topic",
        topic: {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          title: "Topic",
          folder: "",
          concepts: [{ id: "1", text: "", derivatives: [] }],
        },
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      error: null,
    });
    const insertMock = vi.fn().mockReturnThis();
    const selectMock = vi.fn().mockReturnThis();
    fromMock.mockReturnValue({
      insert: insertMock,
      select: selectMock,
      single: singleMock,
    });

    const { POST } = await import("@/app/api/content/route");
    const response = await POST(
      new Request("http://localhost/api/content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Topic",
          topic: {
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            title: "Topic",
            folder: "",
            concepts: [{ id: "1", text: "", derivatives: [] }],
          },
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: "22222222-2222-2222-2222-222222222222",
      }),
    );
  });

  it("returns 400 for PUT when id is missing", async () => {
    requireAuthMock.mockResolvedValue(makeAuthOk());
    const { PUT } = await import("@/app/api/content/route");

    const response = await PUT(
      new Request("http://localhost/api/content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Topic",
          topic: { any: "shape" },
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 for PUT when topic does not belong to authenticated owner", async () => {
    requireAuthMock.mockResolvedValue(
      makeAuthOk("33333333-3333-3333-3333-333333333333"),
    );

    const eqMock = vi.fn().mockReturnThis();
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: eqMock,
      select: vi.fn().mockReturnThis(),
      maybeSingle: maybeSingleMock,
    });

    const { PUT } = await import("@/app/api/content/route");
    const topicId = "44444444-4444-4444-4444-444444444444";
    const response = await PUT(
      new Request("http://localhost/api/content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: topicId,
          title: "Updated",
          topic: { changed: true },
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(eqMock).toHaveBeenCalledWith(
      "owner_id",
      "33333333-3333-3333-3333-333333333333",
    );
  });

  it("returns 200 for PUT when owner updates own topic", async () => {
    requireAuthMock.mockResolvedValue(makeAuthOk());
    const updatedRow = {
      id: "55555555-5555-5555-5555-555555555555",
      title: "Updated",
      topic: { changed: true },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    };
    fromMock.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: updatedRow, error: null }),
    });

    const { PUT } = await import("@/app/api/content/route");
    const response = await PUT(
      new Request("http://localhost/api/content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "55555555-5555-5555-5555-555555555555",
          title: "Updated",
          topic: { changed: true },
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { topic: updatedRow } });
  });

  it("returns 404 for DELETE when topic does not belong to authenticated owner", async () => {
    requireAuthMock.mockResolvedValue(
      makeAuthOk("33333333-3333-3333-3333-333333333333"),
    );
    const eqMock = vi.fn().mockReturnThis();
    fromMock.mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: eqMock,
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const { DELETE } = await import("@/app/api/content/route");
    const topicId = "44444444-4444-4444-4444-444444444444";
    const response = await DELETE(
      new Request(`http://localhost/api/content?id=${topicId}`, {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(404);
    expect(eqMock).toHaveBeenCalledWith(
      "owner_id",
      "33333333-3333-3333-3333-333333333333",
    );
  });

  it("returns 200 for DELETE when owner removes own topic", async () => {
    requireAuthMock.mockResolvedValue(makeAuthOk());
    fromMock.mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { id: "77777777-7777-7777-7777-777777777777" }, error: null }),
    });

    const { DELETE } = await import("@/app/api/content/route");
    const topicId = "77777777-7777-7777-7777-777777777777";
    const response = await DELETE(
      new Request(`http://localhost/api/content?id=${topicId}`, {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { id: topicId, deleted: true },
    });
  });
});
