export type FileSystemNodeType = 'file' | 'folder';

export type FileSystemNodeLike = {
	id: string;
	type: FileSystemNodeType;
	name: string;
	parentId: string | null;
	isRoot?: boolean;
};

export const sanitizeNodeName = (value: string, fallback: string) => {
	const normalized = value.replaceAll('/', ' ').trim().replace(/\s+/g, ' ');
	return normalized || fallback;
};

export const splitLegacyFolderPath = (value: string) =>
	value
		.split('/')
		.map(segment => segment.trim())
		.filter(Boolean);

export const sortNodesForDisplay = <T extends FileSystemNodeLike>(left: T, right: T) => {
	if (left.type !== right.type) return left.type === 'folder' ? -1 : 1;
	return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
};

export const buildNodeMap = <T extends FileSystemNodeLike>(nodes: T[]) =>
	nodes.reduce<Record<string, T>>((acc, node) => {
		acc[node.id] = node;
		return acc;
	}, {});

export const listChildNodes = <T extends FileSystemNodeLike>(
	nodesById: Record<string, T>,
	parentId: string | null
) =>
	Object.values(nodesById)
		.filter(node => node.parentId === parentId && !node.isRoot)
		.sort(sortNodesForDisplay);

export const getAncestorIds = <T extends FileSystemNodeLike>(
	nodeId: string,
	nodesById: Record<string, T>
) => {
	const ancestors: string[] = [];
	let current = nodesById[nodeId];
	while (current?.parentId) {
		ancestors.unshift(current.parentId);
		current = nodesById[current.parentId];
	}
	return ancestors;
};

export const getNodePath = <T extends FileSystemNodeLike>(
	nodeId: string,
	nodesById: Record<string, T>
) => {
	const parts: string[] = [];
	let current = nodesById[nodeId];
	while (current) {
		if (!current.isRoot) parts.unshift(current.name);
		if (!current.parentId) break;
		current = nodesById[current.parentId];
	}
	return parts.length ? `/${parts.join('/')}` : '/';
};

export const getParentPath = <T extends FileSystemNodeLike>(
	nodeId: string,
	nodesById: Record<string, T>
) => {
	const node = nodesById[nodeId];
	if (!node?.parentId) return '/';
	return getNodePath(node.parentId, nodesById);
};

export const isDescendantNode = <T extends FileSystemNodeLike>(
	nodeId: string,
	candidateDescendantId: string | null,
	nodesById: Record<string, T>
) => {
	if (!candidateDescendantId) return false;
	let current = nodesById[candidateDescendantId];
	while (current?.parentId) {
		if (current.parentId === nodeId) return true;
		current = nodesById[current.parentId];
	}
	return false;
};

export const getSubtreeNodeIds = <T extends FileSystemNodeLike>(
	rootId: string,
	nodesById: Record<string, T>
) => {
	const ids: string[] = [];
	const stack = [rootId];
	while (stack.length > 0) {
		const nextId = stack.pop();
		if (!nextId) continue;
		ids.push(nextId);
		for (const node of Object.values(nodesById)) {
			if (node.parentId === nextId) stack.push(node.id);
		}
	}
	return ids;
};

export const getAvailableSiblingName = <T extends FileSystemNodeLike>(
	desiredName: string,
	parentId: string | null,
	nodesById: Record<string, T>,
	excludeId?: string
) => {
	const takenNames = new Set(
		Object.values(nodesById)
			.filter(node => node.parentId === parentId && node.id !== excludeId && !node.isRoot)
			.map(node => node.name.toLocaleLowerCase())
	);

	if (!takenNames.has(desiredName.toLocaleLowerCase())) return desiredName;

	let suffix = 2;
	while (true) {
		const candidate = `${desiredName} (${suffix})`;
		if (!takenNames.has(candidate.toLocaleLowerCase())) return candidate;
		suffix += 1;
	}
};
