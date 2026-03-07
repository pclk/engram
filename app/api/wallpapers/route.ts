import { listWallpapers } from '@/src/server/wallpapers';

export const dynamic = 'force-dynamic';

export async function GET() {
	try {
		const wallpapers = await listWallpapers();
		return Response.json({ data: { wallpapers } });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load wallpapers.';
		return Response.json({ error: message }, { status: 500 });
	}
}
