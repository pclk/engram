import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

import {
	listTopicsRequestSchema,
	listTopicsResponseSchema,
	saveTopicRequestSchema,
	saveTopicResponseSchema,
	topicSchema
} from '@/lib/schemas/content';

export async function GET(request: NextRequest) {
	const parsed = listTopicsRequestSchema.safeParse({
		userId: request.nextUrl.searchParams.get('userId')
	});
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	const db = getDb();
	const { userId } = parsed.data;
	await db.appUser.upsert({
		where: { id: userId },
		create: { id: userId },
		update: {}
	});

	const rows = await db.engramTopic.findMany({
		where: { ownerId: userId },
		orderBy: { updatedAt: 'desc' }
	});

	const response = listTopicsResponseSchema.parse({
		topics: rows.map(row => ({
			id: row.id,
			title: row.title,
			topic: topicSchema.parse(row.topic),
			updatedAt: row.updatedAt.toISOString()
		}))
	});

	return NextResponse.json(response);
}

export async function POST(request: NextRequest) {
	const payload = await request.json();
	const parsed = saveTopicRequestSchema.safeParse(payload);
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	const db = getDb();
	const { userId, userEmail, topic } = parsed.data;
	await db.appUser.upsert({
		where: { id: userId },
		create: { id: userId, email: userEmail ?? undefined },
		update: { email: userEmail ?? undefined }
	});

	const saved = await db.engramTopic.upsert({
		where: { id: topic.id },
		create: {
			id: topic.id,
			ownerId: userId,
			title: topic.title,
			topic
		},
		update: {
			title: topic.title,
			topic,
			ownerId: userId
		}
	});

	const response = saveTopicResponseSchema.parse({
		topic: {
			id: saved.id,
			title: saved.title,
			topic: topicSchema.parse(saved.topic),
			updatedAt: saved.updatedAt.toISOString()
		}
	});

	return NextResponse.json(response);
}
