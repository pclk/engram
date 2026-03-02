import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const matchesAny = (id: string, markers: string[]) => markers.some((marker) => id.includes(marker));

export default defineConfig(() => {
	return {
		server: {
			port: 3000,
			host: '0.0.0.0',
		},
		plugins: [react()],
		resolve: {
			alias: {
				'@': path.resolve(__dirname, '.'),
			}
		},
		build: {
			rollupOptions: {
				output: {
					manualChunks(rawId) {
						if (!rawId.includes('node_modules')) {
							return;
						}

						const id = rawId.replace(/\\/g, '/');

						if (matchesAny(id, ['/node_modules/react/', '/node_modules/react-dom/', '/node_modules/scheduler/'])) {
							return 'react-vendor';
						}

						if (id.includes('/node_modules/react-router') || id.includes('/node_modules/@remix-run/router/')) {
							return 'router-vendor';
						}

						if (matchesAny(id, ['/react-markdown/', '/remark-gfm/', '/rehype-sanitize/', '/remark-parse/', '/remark-rehype/', '/micromark', '/mdast-util-', '/hast-util-', '/unist-util-'])) {
							return 'markdown-vendor';
						}

						if (matchesAny(id, ['/node_modules/@neondatabase/neon-js/', '/node_modules/@neondatabase/postgrest-js/'])) {
							return 'neon-core';
						}

						if (matchesAny(id, ['/node_modules/@neondatabase/auth/', '/node_modules/better-auth/', '/node_modules/@better-fetch/', '/node_modules/@supabase/'])) {
							return 'neon-auth-core';
						}

					},
				},
			},
		}
	};
});
