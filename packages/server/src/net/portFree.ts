import { createServer } from 'node:net';

/**
 * True when `port` on `host` can be listened on right now. The entry checks this before
 * starting Colyseus, which prints its own error stack on a busy port before we can explain.
 * Port 0 (any free port) is always free.
 */
export function portFree(port: number, host: string): Promise<boolean> {
  if (port === 0) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') resolve(false);
      else reject(err);
    });
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}
