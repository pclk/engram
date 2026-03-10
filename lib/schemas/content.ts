import { z } from 'zod';
import { contentNodeSchema } from '@/lib/schemas/filesystem';
import { topicContentSchema, topicDocumentSchema, toTopicDocument } from '@/lib/schemas/topic';

export { contentNodeSchema, topicContentSchema, topicDocumentSchema, toTopicDocument };

const nodeNameSchema = z.string().min(1).max(200);

export const contentUpsertRequestSchema = z.discriminatedUnion('type', [
	z.object({
		id: z.string().uuid().optional(),
		type: z.literal('file'),
		name: nodeNameSchema,
		parentId: z.string().uuid(),
		topic: topicDocumentSchema
	}),
	z.object({
		id: z.string().uuid().optional(),
		type: z.literal('folder'),
		name: nodeNameSchema,
		parentId: z.string().uuid()
	})
]);

export const contentUpdateRequestSchema = z.discriminatedUnion('type', [
	z.object({
		id: z.string().uuid(),
		type: z.literal('file'),
		name: nodeNameSchema,
		parentId: z.string().uuid(),
		topic: topicDocumentSchema
	}),
	z.object({
		id: z.string().uuid(),
		type: z.literal('folder'),
		name: nodeNameSchema,
		parentId: z.string().uuid()
	})
]);

export const contentDeleteRequestSchema = z.object({
	id: z.string().uuid()
});

export const listContentResponseSchema = z.object({
	data: z.object({
		rootId: z.string().uuid(),
		nodes: z.array(contentNodeSchema)
	})
});

export const upsertContentResponseSchema = z.object({
	data: z.object({
		node: contentNodeSchema
	})
});

export const deleteContentResponseSchema = z.object({
	data: z.object({
		id: z.string().uuid(),
		deleted: z.boolean(),
		deletedIds: z.array(z.string().uuid())
	})
});
