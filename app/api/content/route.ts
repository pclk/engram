import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
	buildNodeMap,
	getAvailableSiblingName,
	getSubtreeNodeIds,
	isDescendantNode,
	sanitizeNodeName,
	splitLegacyFolderPath
} from '@/lib/filesystem';
import { getDb } from '@/lib/db';
import { contentDeleteRequestSchema, contentUpdateRequestSchema, contentUpsertRequestSchema } from '@/lib/schemas/content';
import { toLegacyFolder, toTopicDocument } from '@/lib/schemas/topic';
import { requireAuth } from '@/src/server/api/auth';
import { errorResponse, parseJson } from '@/src/server/api/http';

type DbClient = Prisma.TransactionClient | PrismaClient;

const querySchema = z.object({
	id: z.string().uuid().optional()
});

const nodeNameFallback = {
	file: 'Untitled Topic',
	folder: 'Untitled Folder'
} as const;

const toContentRow = (row: {
	id: string;
	parentId: string | null;
	type: 'file' | 'folder';
	name: string;
	topic: Prisma.JsonValue | null;
	isRoot: boolean;
	createdAt: Date;
	updatedAt: Date;
}) => ({
	id: row.id,
	parentId: row.parentId,
	type: row.type,
	name: row.name,
	topic: row.type === 'file' ? toTopicDocument(row.topic) : null,
	isRoot: row.isRoot,
	created_at: row.createdAt.toISOString(),
	updated_at: row.updatedAt.toISOString()
});

const ensureFilesystem = async (db: DbClient, ownerId: string) => {
	const existingRoot = await db.engramNode.findFirst({
		where: { ownerId, isRoot: true }
	});
	if (existingRoot) return existingRoot;

	const root = await db.engramNode.create({
		data: {
			ownerId,
			parentId: null,
			type: 'folder',
			name: 'Root',
			isRoot: true
		}
	});

	const legacyTopics = await db.legacyEngramTopic.findMany({
		where: { ownerId },
		orderBy: [{ createdAt: 'asc' }, { updatedAt: 'asc' }]
	});

	if (legacyTopics.length === 0) return root;

	const nodesById = buildNodeMap([root]);
	const folderCache = new Map<string, string>([['/', root.id]]);

	for (const legacyTopic of legacyTopics) {
		const folderSegments = splitLegacyFolderPath(toLegacyFolder(legacyTopic.topic));
		let parentId = root.id;
		let currentPath = '/';

		for (const rawSegment of folderSegments) {
			const folderName = sanitizeNodeName(rawSegment, nodeNameFallback.folder);
			currentPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
			const cachedFolderId = folderCache.get(currentPath);
			if (cachedFolderId) {
				parentId = cachedFolderId;
				continue;
			}

			const nextFolder = await db.engramNode.create({
				data: {
					ownerId,
					parentId,
					type: 'folder',
					name: folderName
				}
			});
			nodesById[nextFolder.id] = nextFolder;
			folderCache.set(currentPath, nextFolder.id);
			parentId = nextFolder.id;
		}

		const desiredName = sanitizeNodeName(legacyTopic.title, nodeNameFallback.file);
		const fileName = getAvailableSiblingName(desiredName, parentId, nodesById);

		const migratedFile = await db.engramNode.create({
			data: {
				id: legacyTopic.id,
				ownerId,
				parentId,
				type: 'file',
				name: fileName,
				topic: toTopicDocument(legacyTopic.topic),
				createdAt: legacyTopic.createdAt,
				updatedAt: legacyTopic.updatedAt
			}
		});
		nodesById[migratedFile.id] = migratedFile;
	}

	return root;
};

const loadFilesystem = async (db: DbClient, ownerId: string) => {
	const root = await ensureFilesystem(db, ownerId);
	const nodes = await db.engramNode.findMany({
		where: { ownerId },
		orderBy: [{ type: 'asc' }, { name: 'asc' }]
	});
	return { root, nodes, nodesById: buildNodeMap(nodes) };
};

const validateParentFolder = (
	parentId: string,
	nodesById: ReturnType<typeof buildNodeMap>
) => {
	const parent = nodesById[parentId];
	if (!parent) {
		return { ok: false as const, response: errorResponse(404, 'Parent folder not found.') };
	}
	if (parent.type !== 'folder') {
		return { ok: false as const, response: errorResponse(400, 'Parent must be a folder.') };
	}
	return { ok: true as const };
};

export async function GET(request: Request) {
	const authResult = await requireAuth(request);
	if (!authResult.ok) return authResult.response;

	const params = new URL(request.url).searchParams;
	const parsed = querySchema.safeParse({ id: params.get('id') ?? undefined });
	if (!parsed.success) {
		return errorResponse(400, 'Validation failed.', parsed.error.flatten());
	}

	const { root, nodes } = await getDb().$transaction(tx => loadFilesystem(tx, authResult.auth.userId));
	const filteredNodes = parsed.data.id
		? nodes.filter(node => node.id === parsed.data.id)
		: nodes;

	return Response.json({
		data: {
			rootId: root.id,
			nodes: filteredNodes.map(node => toContentRow({
				...node,
				type: node.type
			}))
		}
	});
}

export async function POST(request: Request) {
	const authResult = await requireAuth(request);
	if (!authResult.ok) return authResult.response;

	const body = await parseJson(request, contentUpsertRequestSchema);
	if (!body.ok) return body.response;

	const response = await getDb().$transaction(async tx => {
		const { nodesById } = await loadFilesystem(tx, authResult.auth.userId);
		const parentCheck = validateParentFolder(body.data.parentId, nodesById);
		if (!parentCheck.ok) return parentCheck.response;

		const nextName = getAvailableSiblingName(
			sanitizeNodeName(body.data.name, nodeNameFallback[body.data.type]),
			body.data.parentId,
			nodesById
		);

		const created = await tx.engramNode.create({
			data: {
				id: body.data.id,
				ownerId: authResult.auth.userId,
				parentId: body.data.parentId,
				type: body.data.type,
				name: nextName,
				...(body.data.type === 'file' ? { topic: body.data.topic } : {})
			}
		});

		return Response.json({
			data: {
				node: toContentRow({
					...created,
					type: created.type
				})
			}
		}, { status: 201 });
	});

	return response;
}

export async function PUT(request: Request) {
	const authResult = await requireAuth(request);
	if (!authResult.ok) return authResult.response;

	const body = await parseJson(request, contentUpdateRequestSchema);
	if (!body.ok) return body.response;

	const response = await getDb().$transaction(async tx => {
		const { nodesById } = await loadFilesystem(tx, authResult.auth.userId);
		const existing = nodesById[body.data.id];
		if (!existing || existing.isRoot) {
			return errorResponse(404, 'Content not found.');
		}
		if (existing.type !== body.data.type) {
			return errorResponse(400, 'Node type cannot be changed.');
		}

		const parentCheck = validateParentFolder(body.data.parentId, nodesById);
		if (!parentCheck.ok) return parentCheck.response;

		if (body.data.type === 'folder' && isDescendantNode(body.data.id, body.data.parentId, nodesById)) {
			return errorResponse(400, 'Cannot move a folder into its own subtree.');
		}

		const nextName = getAvailableSiblingName(
			sanitizeNodeName(body.data.name, nodeNameFallback[body.data.type]),
			body.data.parentId,
			nodesById,
			body.data.id
		);

		const updated = await tx.engramNode.update({
			where: { id: body.data.id },
			data: {
				parentId: body.data.parentId,
				name: nextName,
				...(body.data.type === 'file' ? { topic: body.data.topic } : {})
			}
		});

		return Response.json({
			data: {
				node: toContentRow({
					...updated,
					type: updated.type
				})
			}
		});
	});

	return response;
}

export async function DELETE(request: Request) {
	const authResult = await requireAuth(request);
	if (!authResult.ok) return authResult.response;

	const params = new URL(request.url).searchParams;
	const parsed = contentDeleteRequestSchema.safeParse({ id: params.get('id') ?? undefined });
	if (!parsed.success) {
		return errorResponse(400, 'Validation failed.', parsed.error.flatten());
	}

	const response = await getDb().$transaction(async tx => {
		const { nodesById } = await loadFilesystem(tx, authResult.auth.userId);
		const existing = nodesById[parsed.data.id];
		if (!existing || existing.isRoot) {
			return errorResponse(404, 'Content not found.');
		}

		const deletedIds = getSubtreeNodeIds(parsed.data.id, nodesById);
		await tx.engramNode.deleteMany({
			where: {
				ownerId: authResult.auth.userId,
				id: { in: deletedIds }
			}
		});

		return Response.json({
			data: {
				id: parsed.data.id,
				deleted: true,
				deletedIds
			}
		});
	});

	return response;
}
