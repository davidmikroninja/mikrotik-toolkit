export const SCHEMA_VERSION = 1;
export const GENERATOR_VERSION = '0.1.0';
export const TARGET_ROUTEROS = '7.20+';
export const MIN_ROUTEROS_MINOR = 20;

export type FabricId = 'ct' | 'jb';
export type FirewallMode = 'stateful' | 'stateless';
export type InputPolicy = 'drop' | 'accept';
export type ForwardPolicy = 'accept' | 'drop';
export type Ipv6Mode = 'mirror' | 'input-only' | 'off';
export type NdMode = 'unchanged' | 'disable-wan';
export type TransitKind = 'primary' | 'backup';
export type TransitRole = 'customer' | 'provider';
export type RouterService =
  | 'dns'
  | 'ntp'
  | 'mikrotik-update'
  | 'ssh-client'
  | 'syslog'
  | 'smtp'
  | 'snmp-traps';

export interface RouterConfig {
  name: string;
  asn: string;
  routerId: string;
  targetVersion: string;
}

export interface AddressFamilyConfig {
  prefixes: string[];
  /** Allowed outgoing prefix-length range, e.g. "22-24" or "48". */
  advertiseLengths: string;
  /** Reject inbound prefixes longer than this. Empty disables the check. */
  rejectLongerThan: string;
}

export interface AddressFamiliesConfig {
  ipv4: AddressFamilyConfig;
  ipv6: AddressFamilyConfig & { enabled: boolean };
}

export interface Transit {
  id: string;
  name: string;
  kind: TransitKind;
  role: TransitRole;
  asn: string;
  v4: string;
  v6: string;
  defaultRoute: boolean;
  /** Local preference for a received default route. */
  defaultLocalPref: string;
  /** Local preference for other received routes. */
  routesLocalPref: string;
  maxPrefixesV4: string;
  maxPrefixesV6: string;
}

export interface CustomPeer {
  id: string;
  name: string;
  fabric: FabricId;
  asn: string;
  v4: string;
  v6: string;
  localPref: string;
  maxPrefixesV4: string;
  maxPrefixesV6: string;
}

export interface FabricSelection {
  routeServers: boolean;
  /** Catalog peer-group ids selected on this fabric. */
  bilaterals: string[];
}

export interface PeeringConfig {
  ct: FabricSelection;
  jb: FabricSelection;
  customPeers: CustomPeer[];
}

export interface RpkiGroupConfig {
  id: string;
  label: string;
  groupName: string;
  servers: string[];
  port: string;
  enabled: boolean;
}

export interface RpkiConfig {
  enabled: boolean;
  groups: RpkiGroupConfig[];
  /** Apply RPKI validation to transit sessions as well as IXP sessions. */
  enforceOnTransits: boolean;
}

export interface InterfacesConfig {
  wan: string[];
  lan: string[];
  management: string[];
  ospf: string[];
  bfd: string[];
  discovery: string[];
}

export interface ManagementConfig {
  /** CIDRs allowed to manage the router (SSH/Winbox/SNMP). */
  ranges: string[];
  sshRouter: boolean;
  winboxRouter: boolean;
  /** Extra source ranges allowed to SSH through the router to internal hosts. */
  sshForwardRanges: string[];
  snmpServers: string[];
  /** Upstream resolvers when the router serves DNS. */
  dnsUpstreams: string[];
  ntpServers: string[];
  allowLanDns: boolean;
  allowMikrotikUpdate: boolean;
  /** Extra source ranges allowed to reach BGP/179. */
  extraBgpAllowed: string[];
}

export interface FirewallConfig {
  mode: FirewallMode;
  inputPolicy: InputPolicy;
  forwardPolicy: ForwardPolicy;
  ipv6Mode: Ipv6Mode;
  ndMode: NdMode;
  logDrops: boolean;
  dropAmplificationPorts: boolean;
  disableServicePorts: boolean;
  icmpRateLimitMs: string;
  /** Allow DHCP server requests on the LAN interface list. */
  allowDhcpServer: boolean;
  /** Allow DHCPv6 server requests on the LAN interface list. */
  allowDhcpv6Server: boolean;
  /** Allow VRRP (IP protocol 112) to the router. */
  allowVrrp: boolean;
  /** Extra TCP ports accepted to the router, comma separated. */
  extraInputTcp: string;
  /** Extra UDP ports accepted to the router, comma separated. */
  extraInputUdp: string;
  /** Router-originated services whose stateless reply traffic is allowed. */
  statelessRouterServices: RouterService[];
}

export interface Priorities {
  transitDefault: string;
  transitBackupDefault: string;
  transitRoutes: string;
  transitBackupRoutes: string;
  napCt: string;
  napJb: string;
  blpCt: string;
  blpJb: string;
}

export interface Config {
  schemaVersion: number;
  router: RouterConfig;
  addressFamilies: AddressFamiliesConfig;
  transits: Transit[];
  peering: PeeringConfig;
  rpki: RpkiConfig;
  interfaces: InterfacesConfig;
  management: ManagementConfig;
  firewall: FirewallConfig;
  priorities: Priorities;
}

export interface GenerationMeta {
  generatedAt: string;
  generatorVersion: string;
  configId: string;
}

export type FileLanguage = 'routeros' | 'text' | 'json';

export interface GeneratedFile {
  name: string;
  content: string;
  language: FileLanguage;
  description: string;
}

export type IssueLevel = 'error' | 'warning';

export interface ValidationIssue {
  level: IssueLevel;
  field: string;
  message: string;
}
