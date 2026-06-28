import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    fs: {
      allow: [repoRoot],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
