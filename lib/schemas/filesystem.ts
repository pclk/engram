import { z } from 'zod';
import { topicDocumentSchema } from '@/lib/schemas/topic';

export const contentNodeTypeSchema = z.enum(['file', 'folder']);

const baseNodeSchema = z.object({
	id: z.string().uuid(),
	parentId: z.string().uuid().nullable(),
	type: contentNodeTypeSchema,
	name: z.string().min(1).max(200),
	isRoot: z.boolean().default(false),
	created_at: z.string().datetime(),
	updated_at: z.string().datetime()
});

export const fileContentNodeSchema = baseNodeSchema.extend({
	type: z.literal('file'),
	topic: topicDocumentSchema
});

export const folderContentNodeSchema = baseNodeSchema.extend({
	type: z.literal('folder'),
	topic: z.null()
});

export const contentNodeSchema = z.discriminatedUnion('type', [
	fileContentNodeSchema,
	folderContentNodeSchema
]);

export type ContentNode = z.infer<typeof contentNodeSchema>;
