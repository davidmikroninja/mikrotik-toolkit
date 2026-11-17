import { createDefaultConfig, newTransit } from './defaults';
import type { Config } from './types';

export const FIXED_META_DATE = '2026-11-17T00:00:00.000Z';

export function sampleConfig(): Config {
  const config = createDefaultConfig();
  config.router = {
    name: 'test-edge',
    asn: '65000',
    routerId: '192.0.2.1',
    targetVersion: '7.20+',
  };
  config.addressFamilies.ipv4 = {
    prefixes: ['192.0.2.0/24', '198.51.100.0/24'],
    advertiseLengths: '24',
    rejectLongerThan: '24',
  };
  config.addressFamilies.ipv6 = {
    enabled: true,
    prefixes: ['2001:db8::/32'],
    advertiseLengths: '32-48',
    rejectLongerThan: '48',
  };

  const transit = newTransit('primary');
  transit.name = 'ipt-primary';
  transit.asn = '65001';
  transit.v4 = '203.0.113.1';
  transit.v6 = '2001:db8:ffff::1';
  transit.defaultRoute = true;
  config.transits = [transit];

  config.peering.ct.routeServers = true;
  config.peering.ct.bilaterals = ['akamai'];
  config.peering.jb.routeServers = true;
  config.peering.jb.bilaterals = ['netflix'];
  config.peering.customPeers = [
    {
      id: 'peer-local',
      name: 'local-peer',
      fabric: 'ct',
      asn: '65002',
      v4: '198.51.100.9',
      v6: '',
      localPref: '410',
      maxPrefixesV4: '200000',
      maxPrefixesV6: '100000',
    },
  ];

  config.interfaces = {
    wan: ['ether1'],
    lan: ['bridge'],
    management: ['ether2'],
    ospf: [],
    bfd: [],
    discovery: ['bridge'],
  };
  config.management = {
    ranges: ['10.0.0.0/8'],
    sshRouter: true,
    winboxRouter: true,
    sshForwardRanges: ['192.0.2.0/24'],
    snmpServers: ['10.10.0.0/16'],
    dnsUpstreams: ['1.1.1.1', '8.8.8.8'],
    ntpServers: ['pool.ntp.org'],
    allowLanDns: true,
    allowMikrotikUpdate: true,
    extraBgpAllowed: [],
  };
  return config;
}

export function statelessConfig(): Config {
  const config = sampleConfig();
  config.firewall.mode = 'stateless';
  config.firewall.forwardPolicy = 'accept';
  config.firewall.statelessRouterServices = ['dns', 'ntp', 'mikrotik-update'];
  return config;
}

export function minimalConfig(): Config {
  const config = createDefaultConfig();
  config.router = {
    name: 'minimal',
    asn: '65010',
    routerId: '192.0.2.10',
    targetVersion: '7.20+',
  };
  config.addressFamilies.ipv4 = {
    prefixes: ['192.0.2.0/24'],
    advertiseLengths: '24',
    rejectLongerThan: '24',
  };
  config.management.ranges = ['10.0.0.0/8'];
  return config;
}
