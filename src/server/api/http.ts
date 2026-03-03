import { NextResponse } from 'next/server';
import { z } from 'zod';

export const ApiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional()
});

export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;

export const errorResponse = (status: number, error: string, details?: unknown) =>
  NextResponse.json<ApiErrorBody>({ error, ...(details === undefined ? {} : { details }) }, { status });

export const parseJson = async <T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse<ApiErrorBody> }> => {
  let input: unknown;

  try {
    input = await req.json();
  } catch {
    return { ok: false, response: errorResponse(400, 'Invalid JSON body.') };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      response: errorResponse(400, 'Validation failed.', parsed.error.flatten())
    };
  }

  return { ok: true, data: parsed.data };
};
