import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPackage = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
) as { version?: string };
const appVersion = appPackage.version ?? '0.0.0';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_API_TARGET || 'http://127.0.0.1:3100';

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return;
            }

            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/')
            ) {
              return 'react-vendor';
            }

            if (
              id.includes('/react-router/') ||
              id.includes('/react-router-dom/') ||
              id.includes('/@tanstack/react-query/')
            ) {
              return 'app-routing-data';
            }

            if (id.includes('/markdown-it/')) {
              return 'markdown';
            }

            if (id.includes('/@milkdown/preset-gfm/') || id.includes('/prosemirror-tables/')) {
              return 'milkdown-gfm';
            }

            if (id.includes('/react-easy-crop/')) {
              return 'media-tools';
            }
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/realtime': {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: [path.resolve(__dirname, './src/test-setup.ts')],
    },
  };
});
