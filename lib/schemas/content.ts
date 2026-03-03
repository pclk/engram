import { z } from "zod";

export const derivativeTypeSchema = z.enum(["PROBING", "CLOZE", "ELABORATION"]);

export const derivativeSchema = z.object({
  id: z.string().min(1),
  type: derivativeTypeSchema,
  text: z.string(),
});

export const conceptSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  derivatives: z.array(derivativeSchema),
});

export const topicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  folder: z.string().default(""),
  concepts: z.array(conceptSchema).min(1),
});

export const topicRecordSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  topic: topicSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const saveTopicRequestSchema = z.object({
  title: z.string().min(1).max(200),
  topic: topicSchema,
});

export const listTopicsResponseSchema = z.object({
  data: z.object({
    topics: z.array(topicRecordSchema),
  }),
});

export const saveTopicResponseSchema = z.object({
  data: z.object({
    topic: topicRecordSchema,
  }),
});

export const deleteTopicResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    deleted: z.literal(true),
  }),
});
