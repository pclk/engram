import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

import { deleteTopicRequestSchema, deleteTopicResponseSchema } from '@/lib/schemas/content';

export async function DELETE(request: NextRequest, context: { params: Promise<{ topicId: string }> }) {
	const { topicId } = await context.params;
	const parsed = deleteTopicRequestSchema.safeParse({
		topicId,
		userId: request.nextUrl.searchParams.get('userId')
	});

	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	const db = getDb();
	const { userId } = parsed.data;
	await db.engramTopic.deleteMany({
		where: {
			id: topicId,
			ownerId: userId
		}
	});

	const response = deleteTopicResponseSchema.parse({ deleted: true });
	return NextResponse.json(response);
}
