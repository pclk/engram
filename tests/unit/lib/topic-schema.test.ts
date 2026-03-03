import { describe, expect, it } from 'vitest';
import { topicSchema } from '@/src/lib/schemas/topic';

describe('topicSchema', () => {
  it('accepts valid payloads', () => {
    const parsed = topicSchema.parse({
      id: '4a0f9f3b-5f30-4d37-ae8f-13a6d5f1831a',
      title: 'Cardiology',
      folderId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(parsed.title).toBe('Cardiology');
  });

  it('rejects invalid payloads', () => {
    const result = topicSchema.safeParse({
      id: 'not-a-uuid',
      title: '',
      folderId: 'also-not-a-uuid',
      createdAt: 'yesterday',
    });

    expect(result.success).toBe(false);
  });
});
