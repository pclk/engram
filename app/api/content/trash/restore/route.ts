import { getDb } from '@/lib/db';
import { purgeExpiredTrash, toContentRow } from '@/lib/server/content';
import { restoreTrashRequestSchema } from '@/lib/schemas/content';
import { requireAuth } from '@/src/server/api/auth';
import { errorResponse, parseJson } from '@/src/server/api/http';

type TrashRow = {
	id: string;
	parentId: string | null;
	deletedAt: Date;
};

const computeBatchIds = (rootId: string, deletedAt: Date, rows: TrashRow[]) => {
	const childrenByParent = new Map<string, TrashRow[]>();
	for (const row of rows) {
		if (!row.parentId) continue;
		const list = childrenByParent.get(row.parentId) ?? [];
		list.push(row);
		childrenByParent.set(row.parentId, list);
	}
	const ids = new Set<string>();
	const rootRow = rows.find(row => row.id === rootId);
	if (!rootRow) return ids;
	const stack: TrashRow[] = [rootRow];
	while (stack.length) {
		const next = stack.pop();
		if (!next) continue;
		if (next.deletedAt.getTime() !== deletedAt.getTime()) continue;
		ids.add(next.id);
		const children = childrenByParent.get(next.id) ?? [];
		stack.push(...children);
	}
	return ids;
};

export async function POST(request: Request) {
	const authResult = await requireAuth(request);
	if (!authResult.ok) return authResult.response;

	const body = await parseJson(request, restoreTrashRequestSchema);
	if (!body.ok) return body.response;

	const ownerId = authResult.auth.userId;
	const response = await getDb().$transaction(async tx => {
		await purgeExpiredTrash(tx, ownerId);
		const deletedRows = await tx.engramNode.findMany({
			where: { ownerId, deletedAt: { not: null } },
			select: { id: true, parentId: true, deletedAt: true }
		});
		const trashRows: TrashRow[] = deletedRows
			.filter((row): row is typeof row & { deletedAt: Date } => row.deletedAt !== null)
			.map(row => ({ id: row.id, parentId: row.parentId, deletedAt: row.deletedAt }));

		const target = trashRows.find(row => row.id === body.data.id);
		if (!target) {
			return errorResponse(404, 'Item not found in recycle bin.');
		}
		const targetParentIsDeleted = target.parentId !== null
			&& trashRows.some(row => row.id === target.parentId);
		if (targetParentIsDeleted) {
			return errorResponse(400, 'Restore the parent folder first.');
		}

		const restoredIdSet = computeBatchIds(target.id, target.deletedAt, trashRows);
		const restoredIds = Array.from(restoredIdSet);
		await tx.engramNode.updateMany({
			where: { ownerId, id: { in: restoredIds } },
			data: { deletedAt: null }
		});
		const restoredNodes = await tx.engramNode.findMany({
			where: { ownerId, id: { in: restoredIds } }
		});

		return Response.json({
			data: {
				id: target.id,
				restoredIds,
				nodes: restoredNodes.map(node => toContentRow({ ...node, type: node.type }))
			}
		});
	});

	return response;
}
