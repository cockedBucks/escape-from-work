import { defineConfig } from 'vite';

export default defineConfig({
  // Listen on the LAN too, so a second laptop or phone can open the dev page.
  server: { host: true },
  preview: { host: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2023' },
});
