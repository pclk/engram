import { z } from 'zod';
import {
	topicContentSchema,
	topicTransportSchema,
	toTopicContent,
	toTopicTransport
} from '@/lib/schemas/topic';

export { topicContentSchema, topicTransportSchema, toTopicContent, toTopicTransport };

export const saveTopicRequestSchema = z.object({
	userId: z.string().uuid(),
	userEmail: z.string().email().nullable().optional(),
	topic: topicContentSchema
});

export const listTopicsRequestSchema = z.object({
	userId: z.string().uuid()
});

export const deleteTopicRequestSchema = z.object({
	userId: z.string().uuid(),
	topicId: z.string().uuid()
});

export const listTopicsResponseSchema = z.object({
	topics: z.array(topicTransportSchema)
});

export const saveTopicResponseSchema = z.object({
	topic: topicTransportSchema
});

export const deleteTopicResponseSchema = z.object({
	deleted: z.boolean()
});
