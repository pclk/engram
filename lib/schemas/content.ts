import { z } from 'zod';
import {
	topicContentSchema,
	topicTransportSchema,
	toTopicContent,
	toTopicTransport
} from '@/lib/schemas/topic';

export { topicContentSchema, topicTransportSchema, toTopicContent, toTopicTransport };

export const contentUpsertRequestSchema = z.object({
	id: z.string().uuid().optional(),
	title: z.string().min(1).max(200),
	topic: topicContentSchema
});

export const contentDeleteRequestSchema = z.object({
	id: z.string().uuid()
});

export const contentRowSchema = z.object({
	id: z.string().uuid(),
	title: z.string(),
	topic: topicContentSchema,
	created_at: z.string().datetime().optional(),
	updated_at: z.string().datetime().optional()
});

export const listContentResponseSchema = z.object({
	data: z.array(contentRowSchema)
});

export const upsertContentResponseSchema = z.object({
	data: contentRowSchema
});

export const deleteContentResponseSchema = z.object({
	data: z.object({
		id: z.string().uuid(),
		deleted: z.boolean()
	})
});
