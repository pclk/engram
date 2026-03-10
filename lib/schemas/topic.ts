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

export const topicDocumentSchema = z.object({
	concepts: z.array(conceptSchema).min(1)
});

const legacyTopicContentSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	folder: z.string().optional().default(''),
	concepts: z.array(conceptSchema).min(1)
});

export const topicContentSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	parentId: z.string().nullable(),
	path: z.string(),
	concepts: z.array(conceptSchema).min(1)
});

export const topicTransportSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	parentId: z.string().uuid().nullable(),
	path: z.string(),
	topic: topicDocumentSchema,
	updatedAt: z.string().datetime()
});

export type DerivativeType = z.infer<typeof derivativeTypeSchema>;
export type Derivative = z.infer<typeof derivativeSchema>;
export type Concept = z.infer<typeof conceptSchema>;
export type TopicDocument = z.infer<typeof topicDocumentSchema>;
export type TopicContent = z.infer<typeof topicContentSchema>;
export type TopicTransport = z.infer<typeof topicTransportSchema>;

export const toTopicDocument = (topic: unknown): TopicDocument => {
	const parsed = legacyTopicContentSchema.safeParse(topic);
	if (parsed.success) {
		return topicDocumentSchema.parse({
			concepts: parsed.data.concepts
		});
	}

	return topicDocumentSchema.parse(topic);
};

export const toLegacyFolder = (topic: unknown) => {
	const parsed = legacyTopicContentSchema.safeParse(topic);
	return parsed.success ? parsed.data.folder ?? '' : '';
};

export const toTopicTransport = (row: {
	id: string;
	name: string;
	parentId: string | null;
	path: string;
	topic: unknown;
	updatedAt: Date | string;
}): TopicTransport => topicTransportSchema.parse({
	id: row.id,
	name: row.name,
	parentId: row.parentId,
	path: row.path,
	topic: toTopicDocument(row.topic),
	updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt
});
