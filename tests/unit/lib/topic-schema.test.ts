import { describe, expect, it } from 'vitest';
import { topicContentSchema, topicTransportSchema, toTopicTransport } from '@/lib/schemas/topic';

describe('topicContentSchema', () => {
	it('accepts valid topic content payloads', () => {
		const parsed = topicContentSchema.parse({
			id: 'topic-1',
			title: 'Cardiology',
			folder: '',
			concepts: [
				{
					id: 'concept-1',
					text: 'Heart',
					derivatives: [{ id: 'd1', type: 'PROBING', text: 'What does it pump?' }]
				}
			]
		});

		expect(parsed.title).toBe('Cardiology');
	});

	it('rejects invalid topic content payloads', () => {
		const result = topicContentSchema.safeParse({
			id: '',
			title: '',
			folder: null,
			concepts: []
		});

		expect(result.success).toBe(false);
	});
});

describe('toTopicTransport', () => {
	it('adapts database rows into the canonical API transport contract', () => {
		const parsed = toTopicTransport({
			id: '4a0f9f3b-5f30-4d37-ae8f-13a6d5f1831a',
			title: 'Cardiology',
			topic: {
				id: 'topic-1',
				title: 'Cardiology',
				folder: '',
				concepts: [{ id: 'concept-1', text: 'Heart', derivatives: [] }]
			},
			updatedAt: new Date('2026-01-01T00:00:00.000Z')
		});

		expect(topicTransportSchema.parse(parsed).updatedAt).toBe('2026-01-01T00:00:00.000Z');
	});
});
