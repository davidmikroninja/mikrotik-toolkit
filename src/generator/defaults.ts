import { FABRICS } from './catalog';
import {
  SCHEMA_VERSION,
  TARGET_ROUTEROS,
  type Config,
  type CustomPeer,
  type RpkiGroupConfig,
  type Transit,
} from './types';

let idCounter = 0;

export function makeId(prefix: string): string {
  idCounter += 1;
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}${idCounter}`;
  return `${prefix}-${random}-${idCounter}`;
}

function rpkiGroup(fabric: 'ct' | 'jb'): RpkiGroupConfig {
  const data = FABRICS[fabric];
  return {
    id: `rpki-${fabric}`,
    label: data.label,
    groupName: data.rpkiGroup,
    servers: [...data.rpkiServers],
    port: '3323',
    enabled: true,
  };
}

export function createDefaultConfig(): Config {
  return {
    schemaVersion: SCHEMA_VERSION,
    router: {
      name: '',
      asn: '',
      routerId: '',
      targetVersion: TARGET_ROUTEROS,
    },
    addressFamilies: {
      ipv4: {
        prefixes: [],
        advertiseLengths: '22-24',
        rejectLongerThan: '24',
      },
      ipv6: {
        enabled: false,
        prefixes: [],
        advertiseLengths: '32-48',
        rejectLongerThan: '48',
      },
    },
    transits: [],
    peering: {
      ct: { routeServers: false, bilaterals: [] },
      jb: { routeServers: false, bilaterals: [] },
      customPeers: [],
    },
    rpki: {
      enabled: true,
      groups: [rpkiGroup('ct'), rpkiGroup('jb')],
      enforceOnTransits: false,
    },
    interfaces: {
      wan: [],
      lan: [],
      management: [],
      ospf: [],
      bfd: [],
      discovery: [],
    },
    management: {
      ranges: [],
      sshRouter: true,
      winboxRouter: true,
      sshForwardRanges: [],
      snmpServers: [],
      dnsUpstreams: ['1.1.1.1', '8.8.8.8'],
      ntpServers: ['pool.ntp.org'],
      allowLanDns: false,
      allowMikrotikUpdate: true,
      extraBgpAllowed: [],
    },
    firewall: {
      mode: 'stateful',
      inputPolicy: 'drop',
      forwardPolicy: 'accept',
      ipv6Mode: 'mirror',
      ndMode: 'unchanged',
      logDrops: true,
      dropAmplificationPorts: true,
      disableServicePorts: true,
      icmpRateLimitMs: '100',
      allowDhcpServer: true,
      allowDhcpv6Server: true,
      allowVrrp: false,
      extraInputTcp: '',
      extraInputUdp: '',
      statelessRouterServices: ['dns', 'ntp', 'mikrotik-update'],
    },
    priorities: {
      transitDefault: '110',
      transitBackupDefault: '100',
      transitRoutes: '130',
      transitBackupRoutes: '120',
      napCt: '300',
      napJb: '350',
      blpCt: '400',
      blpJb: '450',
    },
  };
}

export function newTransit(kind: 'primary' | 'backup' = 'primary'): Transit {
  return {
    id: makeId('transit'),
    name: '',
    kind,
    role: 'customer',
    asn: '',
    v4: '',
    v6: '',
    defaultRoute: kind === 'primary',
    defaultLocalPref: kind === 'primary' ? '110' : '100',
    routesLocalPref: kind === 'primary' ? '130' : '120',
    maxPrefixesV4: kind === 'primary' ? '1500000' : '1500000',
    maxPrefixesV6: '300000',
  };
}

export function newCustomPeer(fabric: 'ct' | 'jb' = 'ct'): CustomPeer {
  return {
    id: makeId('peer'),
    name: '',
    fabric,
    asn: '',
    v4: '',
    v6: '',
    localPref: fabric === 'ct' ? '400' : '450',
    maxPrefixesV4: '250000',
    maxPrefixesV6: '100000',
  };
}
