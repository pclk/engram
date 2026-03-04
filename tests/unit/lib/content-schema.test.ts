import { describe, expect, it } from 'vitest';

import { listContentResponseSchema, upsertContentResponseSchema } from '@/lib/schemas/content';

describe('content response schemas', () => {
	const row = {
		id: '22222222-2222-4222-8222-222222222222',
		title: 'Biology',
		topic: {
			id: 'topic',
			title: 'Biology',
			folder: '',
			concepts: [{ id: 'c1', text: 'Cell', derivatives: [] }]
		},
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-01T00:00:00.000Z'
	};

	it('parses GET payload from /api/content', () => {
		const payload = {
			data: {
				topics: [row]
			}
		};

		expect(listContentResponseSchema.parse(payload)).toEqual(payload);
	});

	it('parses POST payload from /api/content', () => {
		const payload = {
			data: {
				topic: row
			}
		};

		expect(upsertContentResponseSchema.parse(payload)).toEqual(payload);
	});
});
