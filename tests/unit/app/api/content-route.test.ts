import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '@/tests/mocks/prisma';

const requireAuthMock = vi.fn();

vi.mock('@/src/server/api/auth', () => ({
	requireAuth: requireAuthMock
}));

vi.mock('@/lib/db', () => ({
	getDb: () => prismaMock
}));

const makeAuthOk = (userId = '11111111-1111-1111-1111-111111111111') => ({
	ok: true as const,
	auth: { token: 'token', userId }
});

const rootNode = {
	id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	ownerId: '11111111-1111-1111-1111-111111111111',
	parentId: null,
	type: 'folder' as const,
	name: 'Root',
	topic: null,
	isRoot: true,
	createdAt: new Date('2026-01-01T00:00:00.000Z'),
	updatedAt: new Date('2026-01-01T00:00:00.000Z')
};

describe('/api/content route', () => {
	beforeEach(() => {
		vi.resetModules();
		requireAuthMock.mockReset();
		resetPrismaMock();
		prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
	});

	it('returns auth failure responses from requireAuth', async () => {
		requireAuthMock.mockResolvedValue({
			ok: false,
			response: Response.json({ error: 'Unauthorized.' }, { status: 401 })
		});

		const { GET } = await import('@/app/api/content/route');
		const response = await GET(new Request('http://localhost/api/content'));

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ error: 'Unauthorized.' });
	});

	it('loads the authenticated user filesystem on GET', async () => {
		requireAuthMock.mockResolvedValue(makeAuthOk());
		prismaMock.engramNode.findFirst.mockResolvedValue(rootNode as any);
		prismaMock.engramNode.findMany.mockResolvedValue([
			rootNode,
			{
				id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
				ownerId: rootNode.ownerId,
				parentId: rootNode.id,
				type: 'file',
				name: 'Topic',
				topic: { concepts: [{ id: '1', text: '', derivatives: [] }] },
				isRoot: false,
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				updatedAt: new Date('2026-01-01T00:00:00.000Z')
			}
		] as any);

		const { GET } = await import('@/app/api/content/route');
		const response = await GET(new Request('http://localhost/api/content'));

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			data: {
				rootId: rootNode.id,
				nodes: [
					{
						id: rootNode.id,
						parentId: null,
						type: 'folder',
						name: 'Root',
						topic: null,
						isRoot: true,
						created_at: '2026-01-01T00:00:00.000Z',
						updated_at: '2026-01-01T00:00:00.000Z'
					},
					{
						id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
						parentId: rootNode.id,
						type: 'file',
						name: 'Topic',
						topic: { concepts: [{ id: '1', text: '', derivatives: [] }] },
						isRoot: false,
						created_at: '2026-01-01T00:00:00.000Z',
						updated_at: '2026-01-01T00:00:00.000Z'
					}
				]
			}
		});
		expect(prismaMock.engramNode.findMany).toHaveBeenCalledWith({
			where: { ownerId: rootNode.ownerId },
			orderBy: [{ type: 'asc' }, { name: 'asc' }]
		});
	});

	it('creates a file node scoped to the authenticated owner on POST', async () => {
		requireAuthMock.mockResolvedValue(makeAuthOk());
		prismaMock.engramNode.findFirst.mockResolvedValue(rootNode as any);
		prismaMock.engramNode.findMany.mockResolvedValue([rootNode] as any);
		prismaMock.engramNode.create.mockResolvedValue({
			id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
			ownerId: rootNode.ownerId,
			parentId: rootNode.id,
			type: 'file',
			name: 'Topic',
			topic: { concepts: [{ id: '1', text: '', derivatives: [] }] },
			isRoot: false,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			updatedAt: new Date('2026-01-01T00:00:00.000Z')
		} as any);

		const { POST } = await import('@/app/api/content/route');
		const response = await POST(
			new Request('http://localhost/api/content', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					type: 'file',
					name: 'Topic',
					parentId: rootNode.id,
					topic: {
						concepts: [{ id: '1', text: '', derivatives: [] }]
					}
				})
			})
		);

		expect(response.status).toBe(201);
		expect(prismaMock.engramNode.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				ownerId: rootNode.ownerId,
				parentId: rootNode.id,
				type: 'file',
				name: 'Topic'
			})
		});
	});

	it('deletes a node subtree scoped to the authenticated owner on DELETE', async () => {
		requireAuthMock.mockResolvedValue(makeAuthOk('33333333-3333-3333-3333-333333333333'));
		const ownerRoot = { ...rootNode, ownerId: '33333333-3333-3333-3333-333333333333' };
		prismaMock.engramNode.findFirst.mockResolvedValue(ownerRoot as any);
		prismaMock.engramNode.findMany.mockResolvedValue([
			ownerRoot,
			{
				id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
				ownerId: ownerRoot.ownerId,
				parentId: ownerRoot.id,
				type: 'folder',
				name: 'Docs',
				topic: null,
				isRoot: false,
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				updatedAt: new Date('2026-01-01T00:00:00.000Z')
			},
			{
				id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
				ownerId: ownerRoot.ownerId,
				parentId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
				type: 'file',
				name: 'Topic',
				topic: { concepts: [{ id: '1', text: '', derivatives: [] }] },
				isRoot: false,
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				updatedAt: new Date('2026-01-01T00:00:00.000Z')
			}
		] as any);
		prismaMock.engramNode.deleteMany.mockResolvedValue({ count: 2 } as any);

		const { DELETE } = await import('@/app/api/content/route');
		const response = await DELETE(new Request('http://localhost/api/content?id=dddddddd-dddd-4ddd-8ddd-dddddddddddd', { method: 'DELETE' }));

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			data: {
				id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
				deleted: true,
				deletedIds: [
					'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
					'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
				]
			}
		});
		expect(prismaMock.engramNode.deleteMany).toHaveBeenCalledWith({
			where: {
				ownerId: ownerRoot.ownerId,
				id: { in: ['dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'] }
			}
		});
	});
});
