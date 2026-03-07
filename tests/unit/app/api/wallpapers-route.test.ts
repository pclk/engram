import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';

describe('/api/wallpapers route', () => {
	let tempRoot = '';

	beforeEach(async () => {
		vi.resetModules();
		tempRoot = await mkdtemp(path.join(os.tmpdir(), 'engram-wallpapers-'));
		await mkdir(path.join(tempRoot, 'public'));
		await writeFile(path.join(tempRoot, 'public', 'Cyberpunk 2077 Closeshot'), Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
		await writeFile(path.join(tempRoot, 'public', 'Romantic Night Sky.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
		await writeFile(path.join(tempRoot, 'public', 'logo.svg'), '<svg />');
		vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		if (tempRoot) {
			await rm(tempRoot, { recursive: true, force: true });
		}
	});

	it('lists JPEG and PNG wallpapers from /public and derives labels from filenames', async () => {
		const { GET } = await import('@/app/api/wallpapers/route');
		await writeFile(path.join(tempRoot, 'public', 'Pixel Garden.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		const response = await GET();
		const payload = await response.json() as {
			data: {
				wallpapers: Array<{ filename: string; name: string; src: string }>;
			};
		};

		expect(response.status).toBe(200);
		expect(payload.data.wallpapers).toEqual([
			{
				filename: 'Cyberpunk 2077 Closeshot',
				name: 'Cyberpunk 2077 Closeshot',
				src: '/Cyberpunk%202077%20Closeshot'
			},
			{
				filename: 'Pixel Garden.png',
				name: 'Pixel Garden',
				src: '/Pixel%20Garden.png'
			},
			{
				filename: 'Romantic Night Sky.jpg',
				name: 'Romantic Night Sky',
				src: '/Romantic%20Night%20Sky.jpg'
			}
		]);
	});
});
