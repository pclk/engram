import { Prisma, type PrismaClient } from '@prisma/client';
import { buildNodeMap, sanitizeNodeName, getAvailableSiblingName, splitLegacyFolderPath } from '@/lib/filesystem';
import { toLegacyFolder, toTopicDocument } from '@/lib/schemas/topic';

export type DbClient = Prisma.TransactionClient | PrismaClient;

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const nodeNameFallback = {
	file: 'Untitled Topic',
	folder: 'Untitled Folder'
} as const;

export const toContentRow = (row: {
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

export const purgeExpiredTrash = async (db: DbClient, ownerId: string) => {
	const threshold = new Date(Date.now() - TRASH_RETENTION_MS);
	await db.engramNode.deleteMany({
		where: {
			ownerId,
			deletedAt: { lt: threshold }
		}
	});
};

const ensureFilesystem = async (db: DbClient, ownerId: string) => {
	const existingRoot = await db.engramNode.findFirst({
		where: { ownerId, isRoot: true, deletedAt: null }
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

export const loadFilesystem = async (db: DbClient, ownerId: string) => {
	await purgeExpiredTrash(db, ownerId);
	const root = await ensureFilesystem(db, ownerId);
	const nodes = await db.engramNode.findMany({
		where: { ownerId, deletedAt: null },
		orderBy: [{ type: 'asc' }, { name: 'asc' }]
	});
	return { root, nodes, nodesById: buildNodeMap(nodes) };
};
