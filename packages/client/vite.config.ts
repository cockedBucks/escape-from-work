import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The game server port (net.port). In dev the page is served by Vite, so the F2 tuning
// panel's /dev requests are proxied to the game server (same origin, no CORS).
const tuning = JSON.parse(readFileSync(new URL('../../config/tuning.json', import.meta.url), 'utf8')) as {
  net: { port: number };
};

export default defineConfig({
  // Listen on the LAN too, so a second laptop or phone can open the dev page.
  server: {
    host: true,
    proxy: {
      '/dev': `http://localhost:${tuning.net.port}`,
      // Bobblehead faces live on the host PC and are served by the game server.
      '/faces': `http://localhost:${tuning.net.port}`,
    },
  },
  preview: { host: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2023' },
});
