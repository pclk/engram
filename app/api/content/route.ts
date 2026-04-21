import { z } from 'zod';
import {
	buildNodeMap,
	getAvailableSiblingName,
	getSubtreeNodeIds,
	isDescendantNode,
	sanitizeNodeName
} from '@/lib/filesystem';
import { getDb } from '@/lib/db';
import { loadFilesystem, nodeNameFallback, toContentRow } from '@/lib/server/content';
import { contentDeleteRequestSchema, contentUpdateRequestSchema, contentUpsertRequestSchema } from '@/lib/schemas/content';
import { requireAuth } from '@/src/server/api/auth';
import { errorResponse, parseJson } from '@/src/server/api/http';

const querySchema = z.object({
	id: z.string().uuid().optional()
});

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
		const deletedAt = new Date();
		await tx.engramNode.updateMany({
			where: {
				ownerId: authResult.auth.userId,
				id: { in: deletedIds },
				deletedAt: null
			},
			data: { deletedAt }
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
