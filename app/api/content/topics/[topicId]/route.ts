import { errorResponse } from '@/src/server/api/http';

export async function DELETE() {
	return errorResponse(410, 'Deprecated endpoint.', {
		deprecatedEndpoint: '/api/content/topics/:topicId',
		replacementEndpoint: '/api/content?id=<topicId>',
		notes: 'Use canonical /api/content DELETE and authenticated session token. Do not send userId in query/body.'
	});
}
