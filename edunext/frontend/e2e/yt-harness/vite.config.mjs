import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Dedicated build for the YouTubePlayer Playwright harness (kept out of the app
// bundle). `npx vite build/preview -c <this>`.
export default defineConfig({
  plugins: [react()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
  },
  preview: { port: 4199, strictPort: true },
});
