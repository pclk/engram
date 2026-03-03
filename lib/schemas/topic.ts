import { z } from 'zod';

export const derivativeTypeSchema = z.enum(['PROBING', 'CLOZE', 'ELABORATION']);

export const derivativeSchema = z.object({
	id: z.string().min(1),
	type: derivativeTypeSchema,
	text: z.string()
});

export const conceptSchema = z.object({
	id: z.string().min(1),
	text: z.string(),
	derivatives: z.array(derivativeSchema)
});

export const topicContentSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	folder: z.string().default(''),
	concepts: z.array(conceptSchema).min(1)
});

export const topicTransportSchema = z.object({
	id: z.string().uuid(),
	title: z.string(),
	topic: topicContentSchema,
	updatedAt: z.string().datetime()
});

export type DerivativeType = z.infer<typeof derivativeTypeSchema>;
export type Derivative = z.infer<typeof derivativeSchema>;
export type Concept = z.infer<typeof conceptSchema>;
export type TopicContent = z.infer<typeof topicContentSchema>;
export type TopicTransport = z.infer<typeof topicTransportSchema>;

export const toTopicTransport = (row: {
	id: string;
	title: string;
	topic: unknown;
	updatedAt: Date | string;
}): TopicTransport => topicTransportSchema.parse({
	id: row.id,
	title: row.title,
	topic: topicContentSchema.parse(row.topic),
	updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt
});

export const toTopicContent = (topic: unknown): TopicContent => topicContentSchema.parse(topic);
