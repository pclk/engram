import { z } from 'zod';

export const topicSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  folderId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export type Topic = z.infer<typeof topicSchema>;
