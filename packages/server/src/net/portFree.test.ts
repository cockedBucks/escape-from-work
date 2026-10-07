import { createServer, type AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { portFree } from './portFree';

describe('portFree', () => {
  it('says no for a port someone listens on, yes once it is closed', async () => {
    const busy = createServer();
    await new Promise<void>((resolve) => busy.listen(0, '127.0.0.1', resolve));
    const { port } = busy.address() as AddressInfo;
    expect(await portFree(port, '127.0.0.1')).toBe(false);
    await new Promise<void>((resolve) => busy.close(() => resolve()));
    expect(await portFree(port, '127.0.0.1')).toBe(true);
  });

  it('port 0 (any free port) is always free', async () => {
    expect(await portFree(0, '127.0.0.1')).toBe(true);
  });
});
