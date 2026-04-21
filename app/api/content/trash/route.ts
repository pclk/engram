import { z } from 'zod';
import { buildNodeMap, getSubtreeNodeIds } from '@/lib/filesystem';
import { getDb } from '@/lib/db';
import { purgeExpiredTrash, TRASH_RETENTION_MS } from '@/lib/server/content';
import { toTopicDocument } from '@/lib/schemas/topic';
import { requireAuth } from '@/src/server/api/auth';
import { errorResponse } from '@/src/server/api/http';

const purgeQuerySchema = z.object({
	id: z.string().uuid().optional()
});

type TrashNode = {
	id: string;
	parentId: string | null;
	type: 'file' | 'folder';
	name: string;
	deletedAt: Date;
};

const computeVisibleRoots = (deletedNodes: TrashNode[]) => {
	const deletedById = new Map(deletedNodes.map(n => [n.id, n]));
	return deletedNodes.filter(n => !n.parentId || !deletedById.has(n.parentId));
};

const countDescendants = (rootId: string, deletedNodes: TrashNode[]) => {
	const childrenByParent = new Map<string, TrashNode[]>();
	for (const node of deletedNodes) {
		if (!node.parentId) continue;
		const list = childrenByParent.get(node.parentId) ?? [];
		list.push(node);
		childrenByParent.set(node.parentId, list);
	}
	let count = 0;
	const stack = [...(childrenByParent.get(rootId) ?? [])];
	while (stack.length) {
		const next = stack.pop();
		if (!next) continue;
		count += 1;
		stack.push(...(childrenByParent.get(next.id) ?? []));
	}
	return count;
};

export async function GET(request: Request) {
	const authResult = await requireAuth(request);
	if (!authResult.ok) return authResult.response;

	const ownerId = authResult.auth.userId;
	const entries = await getDb().$transaction(async tx => {
		await purgeExpiredTrash(tx, ownerId);
		const deletedRows = await tx.engramNode.findMany({
			where: { ownerId, deletedAt: { not: null } },
			orderBy: [{ deletedAt: 'desc' }, { name: 'asc' }]
		});
		const trashNodes: TrashNode[] = deletedRows
			.filter(row => row.deletedAt !== null)
			.map(row => ({
				id: row.id,
				parentId: row.parentId,
				type: row.type,
				name: row.name,
				deletedAt: row.deletedAt as Date
			}));

		const roots = computeVisibleRoots(trashNodes);
		return roots.map(root => ({
			id: root.id,
			parentId: root.parentId,
			type: root.type,
			name: root.name,
			deletedAt: root.deletedAt.toISOString(),
			expiresAt: new Date(root.deletedAt.getTime() + TRASH_RETENTION_MS).toISOString(),
			descendantsCount: countDescendants(root.id, trashNodes)
		}));
	});

	return Response.json({ data: { entries } });
}

export async function DELETE(request: Request) {
	const authResult = await requireAuth(request);
	if (!authResult.ok) return authResult.response;

	const params = new URL(request.url).searchParams;
	const parsed = purgeQuerySchema.safeParse({ id: params.get('id') ?? undefined });
	if (!parsed.success) {
		return errorResponse(400, 'Validation failed.', parsed.error.flatten());
	}

	const ownerId = authResult.auth.userId;
	const response = await getDb().$transaction(async tx => {
		await purgeExpiredTrash(tx, ownerId);
		const deletedRows = await tx.engramNode.findMany({
			where: { ownerId, deletedAt: { not: null } },
			select: { id: true, parentId: true, type: true, name: true, deletedAt: true }
		});

		if (!parsed.data.id) {
			const purgedIds = deletedRows.map(row => row.id);
			if (purgedIds.length > 0) {
				await tx.engramNode.deleteMany({ where: { ownerId, id: { in: purgedIds } } });
			}
			return Response.json({ data: { purgedIds } });
		}

		const trashNodes: TrashNode[] = deletedRows
			.filter((row): row is typeof row & { deletedAt: Date } => row.deletedAt !== null)
			.map(row => ({
				id: row.id,
				parentId: row.parentId,
				type: row.type,
				name: row.name,
				deletedAt: row.deletedAt
			}));
		const target = trashNodes.find(node => node.id === parsed.data.id);
		if (!target) {
			return errorResponse(404, 'Item not found in recycle bin.');
		}
		const nodesById = buildNodeMap(trashNodes);
		const purgedIds = getSubtreeNodeIds(target.id, nodesById);
		await tx.engramNode.deleteMany({
			where: { ownerId, id: { in: purgedIds } }
		});
		return Response.json({ data: { purgedIds } });
	});

	return response;
}
