import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Console output from passing tests is noise; failures still show theirs.
    silent: 'passed-only',
    projects: [
      { test: { name: 'shared', include: ['packages/shared/src/**/*.test.ts'] } },
      { test: { name: 'server', include: ['packages/server/src/**/*.test.ts'] } },
      { test: { name: 'client', include: ['packages/client/src/**/*.test.ts'] } },
      // Real server + real Colyseus clients in-process; allow time for sockets.
      { test: { name: 'integration', include: ['tests/*.test.ts'], testTimeout: 15_000 } },
      // Opt-in, minutes long: `npm run test:load` (not part of verify).
      { test: { name: 'load', include: ['tests/load/*.test.ts'], testTimeout: 300_000 } },
    ],
  },
});
