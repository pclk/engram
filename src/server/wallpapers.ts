import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { deriveWallpaperName, type WallpaperOption } from '@/src/lib/wallpapers';

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const PUBLIC_DIR = path.join(process.cwd(), 'public');

const hasSignature = (bytes: Uint8Array, signature: number[]) =>
	signature.every((value, index) => bytes[index] === value);

const isSupportedWallpaperFile = async (filename: string) => {
	const extension = path.extname(filename).toLowerCase();
	if (extension === '.jpg' || extension === '.jpeg' || extension === '.png') return true;

	try {
		const file = await readFile(path.join(PUBLIC_DIR, filename));
		return hasSignature(file, JPEG_SIGNATURE) || hasSignature(file, PNG_SIGNATURE);
	} catch {
		return false;
	}
};

const toPublicSrc = (filename: string) => `/${encodeURIComponent(filename)}`;

export async function listWallpapers(): Promise<WallpaperOption[]> {
	const entries = await readdir(PUBLIC_DIR, { withFileTypes: true });
	const filenames = entries
		.filter(entry => entry.isFile())
		.map(entry => entry.name)
		.sort((left, right) => left.localeCompare(right));

	const wallpapers = await Promise.all(
		filenames.map(async filename => {
			if (!(await isSupportedWallpaperFile(filename))) return null;
			return {
				filename,
				name: deriveWallpaperName(filename),
				src: toPublicSrc(filename)
			} satisfies WallpaperOption;
		})
	);

	return wallpapers.filter((wallpaper): wallpaper is WallpaperOption => wallpaper !== null);
}
