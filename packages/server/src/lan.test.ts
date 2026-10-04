import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { lanAddresses, lanUrls } from './lan';

function v4(address: string, internal = false): NetworkInterfaceInfo {
  return { address, internal, family: 'IPv4', netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: null };
}

describe('lan', () => {
  const ifaces = {
    lo: [v4('127.0.0.1', true)],
    wifi: [
      v4('192.168.1.23'),
      { ...v4('fe80::1'), family: 'IPv6', scopeid: 0 } as NetworkInterfaceInfo,
    ],
    ethernet: [v4('10.0.0.5')],
    noNetwork: [v4('169.254.10.10')],
    vpnDuplicate: [v4('10.0.0.5')],
    empty: undefined,
  };

  it('keeps reachable IPv4 addresses only, without duplicates', () => {
    expect(lanAddresses(ifaces)).toEqual(['192.168.1.23', '10.0.0.5']);
  });

  it('lists localhost first, then LAN URLs with the port', () => {
    expect(lanUrls(2567, ifaces)).toEqual([
      'http://localhost:2567',
      'http://192.168.1.23:2567',
      'http://10.0.0.5:2567',
    ]);
  });

  it('skips virtual adapters (Hyper-V/WSL, VirtualBox, Docker)', () => {
    const withVirtual = {
      'Wi-Fi': [v4('192.168.0.105')],
      'vEthernet (Default Switch)': [v4('172.20.80.1')],
      'vEthernet (WSL (Hyper-V firewall))': [v4('172.24.128.1')],
      'VirtualBox Host-Only Network': [v4('192.168.56.1')],
      docker0: [v4('172.17.0.1')],
    };
    expect(lanAddresses(withVirtual)).toEqual(['192.168.0.105']);
  });

  it('works with no network at all', () => {
    expect(lanUrls(2567, {})).toEqual(['http://localhost:2567']);
  });
});
