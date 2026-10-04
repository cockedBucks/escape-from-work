import type { NetworkInterfaceInfo } from 'node:os';

type Interfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

/** Virtual adapters (Hyper-V/WSL, VirtualBox, VMware, Docker) that coworkers cannot reach. */
const VIRTUAL_ADAPTER = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|docker|^br-|^veth/i;

/**
 * IPv4 addresses other devices on the LAN can reach. Skips loopback, virtual adapters and
 * link-local (169.254.x.x, which Windows assigns when there is no real network).
 */
export function lanAddresses(ifaces: Interfaces): string[] {
  const out: string[] = [];
  for (const [name, list] of Object.entries(ifaces)) {
    if (VIRTUAL_ADAPTER.test(name)) continue;
    for (const info of list ?? []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (info.address.startsWith('169.254.')) continue;
      if (!out.includes(info.address)) out.push(info.address);
    }
  }
  return out;
}

/** URLs to print at startup: this PC first, then every LAN address. */
export function lanUrls(port: number, ifaces: Interfaces): string[] {
  return [`http://localhost:${port}`, ...lanAddresses(ifaces).map((a) => `http://${a}:${port}`)];
}
