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

export const topicSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	folder: z.string().default(''),
	concepts: z.array(conceptSchema).min(1)
});

export const saveTopicRequestSchema = z.object({
	userId: z.string().uuid(),
	userEmail: z.string().email().nullable().optional(),
	topic: topicSchema
});

export const listTopicsRequestSchema = z.object({
	userId: z.string().uuid()
});

export const deleteTopicRequestSchema = z.object({
	userId: z.string().uuid(),
	topicId: z.string().uuid()
});

export const topicRecordSchema = z.object({
	id: z.string().uuid(),
	title: z.string(),
	topic: topicSchema,
	updatedAt: z.string().datetime()
});

export const listTopicsResponseSchema = z.object({
	topics: z.array(topicRecordSchema)
});

export const saveTopicResponseSchema = z.object({
	topic: topicRecordSchema
});

export const deleteTopicResponseSchema = z.object({
	deleted: z.boolean()
});
