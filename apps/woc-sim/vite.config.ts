import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const wocRoot = resolve(here, '../../../world-of-claudecraft');

export default defineConfig({
  plugins: [react()],
  define: {
    // Injected at build time so scene.ts can construct GLB URLs without
    // hardcoding absolute paths. In dev mode Vite serves /@fs/<abs-path>.
    __WOC_PUBLIC__: JSON.stringify('/@fs' + resolve(wocRoot, 'public')),
  },
  resolve: {
    alias: [
      // Sub-path imports (e.g. three/examples/jsm/...) must come first
      {
        find: /^three\/examples\/jsm\/(.*)$/,
        replacement: resolve(wocRoot, 'node_modules/three/examples/jsm/$1'),
      },
      // Base three import resolves to WoC's installed Three.js
      {find: /^three$/, replacement: resolve(wocRoot, 'node_modules/three')},
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    fs: {
      allow: [repoRoot, wocRoot],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
});
