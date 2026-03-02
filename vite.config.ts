import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
            manualChunks(id) {
              if (!id.includes('node_modules')) {
                return;
              }

              if (id.includes('/@neondatabase/neon-js/auth/react/ui/') || id.includes('/@neondatabase/auth/dist/ui-')) {
                return 'neon-auth-ui';
              }

              if (id.includes('/@neondatabase/neon-js/auth/') || id.includes('/@neondatabase/auth/dist/react/') || id.includes('/@neondatabase/auth/dist/neon-auth-')) {
                return 'neon-auth';
              }


              if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react-router-dom/')) {
                return 'react-vendor';
              }

              if (id.includes('/react-markdown/') || id.includes('/remark-gfm/') || id.includes('/rehype-sanitize/')) {
                return 'markdown-vendor';
              }

            },
          },
        },
      }
    };
});
