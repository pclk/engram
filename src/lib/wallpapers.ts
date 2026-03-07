export type WallpaperOption = {
	filename: string;
	name: string;
	src: string;
};

export const DEFAULT_WALLPAPER_OPACITY = 35;

export const deriveWallpaperName = (filename: string) =>
	filename.replace(/\.(avif|gif|jpe?g|png|svg|webp)$/i, '');

export const normalizeWallpaperOpacity = (
	value: number | string | null | undefined,
	fallback = DEFAULT_WALLPAPER_OPACITY
) => {
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(0, Math.min(100, Math.round(parsed)));
};
