import { describe, expect, it } from 'vitest';

const collectionDetails = {
  deprecatedEndpoint: '/api/content/topics',
  replacementEndpoint: '/api/content',
  notes:
    'Use canonical /api/content contract: GET /api/content, POST /api/content, PUT /api/content, DELETE /api/content?id=<topicId> with authenticated session token. Do not send userId in query/body.'
};

const topicDetails = {
  deprecatedEndpoint: '/api/content/topics/:topicId',
  replacementEndpoint: '/api/content',
  notes:
    'Use canonical /api/content contract: GET /api/content, POST /api/content, PUT /api/content, DELETE /api/content?id=<topicId> with authenticated session token. Do not send userId in query/body.'
};

describe('deprecated /api/content/topics collection route', () => {
  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const)('returns 410 for %s', async (method) => {
    const route = await import('@/app/api/content/topics/route');
    const response = await route[method]();

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: 'Deprecated endpoint.',
      details: collectionDetails
    });
  });
});

describe('deprecated /api/content/topics/:topicId route', () => {
  it.each(['GET', 'PUT', 'PATCH', 'DELETE'] as const)('returns 410 for %s', async (method) => {
    const route = await import('@/app/api/content/topics/[topicId]/route');
    const response = await route[method]();

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: 'Deprecated endpoint.',
      details: topicDetails
    });
  });
});
