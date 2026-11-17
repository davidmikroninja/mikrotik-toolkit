import { generatedHeader } from './header';
import { parseAddress } from './net';
import { allowedBgpRanges, splitByFamily } from './peers';
import type { Config, GeneratedFile, GenerationMeta } from './types';
import { csv, lines, rosString, uniqueSorted } from './utils';

const c = (text: string) => `comment=${rosString(text)}`;
const q = (text: string) => rosString(text);

function ifaceList(name: string): string {
  return `in-interface-list=${q(name)}`;
}

function srcList(name: string): string {
  return `src-address-list=${q(name)}`;
}

function dropOptions(config: Config, prefix: string): string {
  if (!config.firewall.logDrops) return '';
  return ` log=yes log-prefix=${q(prefix)}`;
}

interface AddressListSet {
  v4: Map<string, string[]>;
  v6: Map<string, string[]>;
}

function addToList(map: Map<string, string[]>, list: string, values: string[]): void {
  if (values.length === 0) return;
  const existing = map.get(list) ?? [];
  map.set(list, uniqueSorted([...existing, ...values]));
}

function buildAddressLists(config: Config): AddressListSet {
  const v4 = new Map<string, string[]>();
  const v6 = new Map<string, string[]>();
  const ranges = splitByFamily(config.management.ranges);
  addToList(v4, 'management', ranges.v4);
  addToList(v6, 'management', ranges.v6);

  const bgp = allowedBgpRanges(config);
  addToList(v4, 'bgp-allowed', bgp.v4);
  addToList(v6, 'bgp-allowed', bgp.v6);

  const ssh = splitByFamily(config.management.sshForwardRanges);
  addToList(v4, 'ssh-allowed', ssh.v4);
  addToList(v6, 'ssh-allowed', ssh.v6);

  const snmp = splitByFamily(config.management.snmpServers);
  addToList(v4, 'snmp-allowed', snmp.v4);
  addToList(v6, 'snmp-allowed', snmp.v6);

  const dnsV4: string[] = [];
  const dnsV6: string[] = [];
  config.management.dnsUpstreams.forEach((server) => {
    const parsed = parseAddress(server);
    if (!parsed) return;
    if (parsed.family === 4) dnsV4.push(server);
    else dnsV6.push(server);
  });
  addToList(v4, 'dns-allowed', dnsV4);
  addToList(v6, 'dns-allowed', dnsV6);

  const ntpV4: string[] = [];
  const ntpV6: string[] = [];
  config.management.ntpServers.forEach((server) => {
    const parsed = parseAddress(server);
    if (!parsed) {
      // Hostname: RouterOS resolves these in each address family's list.
      ntpV4.push(server);
      ntpV6.push(server);
    } else if (parsed.family === 4) {
      ntpV4.push(server);
    } else {
      ntpV6.push(server);
    }
  });
  addToList(v4, 'ntp-servers', ntpV4);
  addToList(v6, 'ntp-servers', ntpV6);

  if (config.management.allowMikrotikUpdate) {
    addToList(v4, 'mik-update', ['update.mikrotik.com', 'cloud.mikrotik.com']);
    addToList(v6, 'mik-update', ['update.mikrotik.com', 'cloud.mikrotik.com']);
  }

  return { v4, v6 };
}

function interfaceListDefinitions(): string {
  const lists = ['wan', 'lan', 'management', 'ospf-neighbours', 'bfd-neighbours', 'mndp-allowed'];
  return lines(
    '# --- Interface lists -------------------------------------------------------',
    ...lists.map(
      (name) =>
        `:if ([:len [/interface list find where name=${q(name)}]] = 0) do={ /interface list add name=${q(name)} }`,
    ),
  );
}

function interfaceListMembers(config: Config): string {
  const assignments: Array<[string, string[]]> = [
    ['wan', config.interfaces.wan],
    ['lan', config.interfaces.lan],
    ['management', config.interfaces.management],
    ['ospf-neighbours', config.interfaces.ospf],
    ['bfd-neighbours', config.interfaces.bfd],
    ['mndp-allowed', config.interfaces.discovery],
  ];
  const members: string[] = [];
  assignments.forEach(([list, interfaces]) => {
    uniqueSorted(interfaces).forEach((iface) => {
      members.push(
        `:if ([:len [/interface find where name=${q(iface)}]] > 0) do={ :if ([:len [/interface list member find where list=${q(list)} and interface=${q(iface)}]] = 0) do={ /interface list member add list=${q(list)} interface=${q(iface)} ${c('GEN-FW:member')} } }`,
      );
    });
  });
  if (members.length === 0) {
    return '# --- Interface list members ------------------------------------------------\n# No interfaces selected; all interface lists remain empty.';
  }
  return lines(
    '# --- Interface list members ------------------------------------------------',
    ...members,
  );
}

function addressListCommands(config: Config): string {
  const lists = buildAddressLists(config);
  const commands: string[] = ['# --- Address lists ---------------------------------------------------------'];
  if (lists.v4.size === 0 && lists.v6.size === 0) {
    commands.push('# No address-list entries generated.');
    return lines(...commands);
  }
  lists.v4.forEach((values, list) => {
    values.forEach((address) => {
      commands.push(
        `/ip firewall address-list add list=${q(list)} address=${q(address)} ${c(`GEN-FW:${list}`)}`,
      );
    });
  });
  lists.v6.forEach((values, list) => {
    values.forEach((address) => {
      commands.push(
        `/ipv6 firewall address-list add list=${q(list)} address=${q(address)} ${c(`GEN-FW:${list}`)}`,
      );
    });
  });
  return lines(...commands);
}

function serviceCommands(config: Config): string {
  const manage = config.management;
  const serviceAddress = manage.ranges.length > 0 ? ` address=${q(csv(manage.ranges))}` : '';
  const commands: string[] = ['# --- Router services -------------------------------------------------------'];
  ['telnet', 'ftp', 'www', 'www-ssl', 'api', 'api-ssl'].forEach((service) => {
    commands.push(`/ip service set ${service} disabled=yes`);
  });
  if (manage.sshRouter) {
    commands.push(
      lines(
        `# SSH to the router from the management ranges${
          manage.ranges.length === 0 ? ' (WARNING: no range configured, so address is unrestricted)' : ''
        }`,
        `/ip service set ssh disabled=no port=22${serviceAddress}`,
      ),
    );
  } else {
    commands.push('/ip service set ssh disabled=yes');
  }
  if (manage.winboxRouter) {
    commands.push(
      lines(
        `# Winbox to the router from the management ranges${
          manage.ranges.length === 0 ? ' (WARNING: no range configured, so address is unrestricted)' : ''
        }`,
        `/ip service set winbox disabled=no port=8291${serviceAddress}`,
      ),
    );
  } else {
    commands.push('/ip service set winbox disabled=yes');
  }
  commands.push('/ip ssh set strong-crypto=yes');
  return lines(...commands);
}

function systemCommands(config: Config): string {
  const manage = config.management;
  const firewall = config.firewall;
  const commands: string[] = ['# --- System hardening ------------------------------------------------------'];

  commands.push(
    `:do { /ip proxy set enabled=no } on-error={ :log warning "GEN: /ip proxy menu not available" }`,
    `:do { /ip smb set enabled=no } on-error={ :log warning "GEN: /ip smb menu not available" }`,
    `:do { /ip socks set enabled=no } on-error={ :log warning "GEN: /ip socks menu not available" }`,
    `:do { /ip upnp set enabled=no } on-error={ :log warning "GEN: /ip upnp menu not available" }`,
    '/ip cloud set ddns-enabled=auto update-time=yes',
    ':do { /ip service set reverse-proxy disabled=yes } on-error={ :log debug "GEN: reverse-proxy service not available" }',
    ':do { /tool bandwidth-server set enabled=no } on-error={ :log debug "GEN: bandwidth-server not available" }',
    '/interface detect-internet set detect-interface-list=none wan-interface-list=none lan-interface-list=none internet-interface-list=none',
    '/tool romon port set [find interface=all] forbid=yes',
    '/tool mac-server set allowed-interface-list="management"',
    '/tool mac-server mac-winbox set allowed-interface-list="management"',
    '/ip neighbor discovery-settings set discover-interface-list="mndp-allowed"',
  );

  if (firewall.disableServicePorts) {
    commands.push(
      ':foreach sp in=[/ip firewall service-port find] do={ :do { /ip firewall service-port set $sp disabled=yes } on-error={ :log debug "GEN: built-in service-port skipped" } }',
    );
  }
  if (firewall.mode === 'stateful') {
    commands.push('/ip firewall connection tracking set enabled=auto');
  } else {
    commands.push(
      '# Conntrack is disabled for the stateless mode. NAT cannot work on this router.',
      '/ip firewall connection tracking set enabled=no',
    );
  }
  if (firewall.icmpRateLimitMs.trim()) {
    commands.push(`/ip settings set icmp-rate-limit=${firewall.icmpRateLimitMs.trim()}`);
  }

  if (config.addressFamilies.ipv6.enabled) {
    commands.push('/ipv6 settings set disable-ipv6=no');
  }

  const dnsServers = manage.dnsUpstreams.length > 0 ? ` servers=${q(csv(manage.dnsUpstreams))}` : '';
  commands.push(
    `/ip dns set allow-remote-requests=${manage.allowLanDns ? 'yes' : 'no'}${dnsServers}`,
  );

  if (manage.ntpServers.length > 0) {
    commands.push(
      `/system ntp client set enabled=yes mode=unicast servers=${q(csv(manage.ntpServers))}`,
    );
  } else {
    commands.push('/system ntp client set enabled=no');
  }

  return lines(...commands);
}

function ndCommands(config: Config): string {
  if (config.firewall.ndMode !== 'disable-wan' || config.interfaces.wan.length === 0) {
    return '';
  }
  const commands: string[] = ['# --- IPv6 neighbour discovery ----------------------------------------------',
    '# Keep ND enabled on LAN; disable it only on the WAN interfaces.'];
  uniqueSorted(config.interfaces.wan).forEach((iface) => {
    commands.push(
      `:if ([:len [/ipv6 nd find where interface=${q(iface)}]] > 0) do={ /ipv6 nd set [find where interface=${q(iface)}] disabled=yes }`,
    );
  });
  return lines(...commands);
}

function statefulInputRules(config: Config): string[] {
  const manage = config.management;
  const rules: string[] = [];
  const add = (rule: string) => rules.push(`/ip firewall filter add ${rule}`);

  add(`chain=input action=accept connection-state=established,related ${c('GEN-FW:input-established')}`);
  add(`chain=input action=drop connection-state=invalid ${c('GEN-FW:input-invalid')}`);
  add(`chain=input action=accept protocol=icmp ${c('GEN-FW:input-icmp')}`);
  add(`chain=input action=accept protocol=udp src-port=67 dst-port=68 ${c('GEN-FW:input-dhcp-client')}`);

  if (config.interfaces.ospf.length > 0) {
    add(`chain=input action=accept protocol=ospf ${ifaceList('ospf-neighbours')} ${c('GEN-FW:input-ospf')}`);
  }
  if (config.interfaces.bfd.length > 0) {
    add(
      `chain=input action=accept protocol=udp dst-port=3784,4784 ${ifaceList('bfd-neighbours')} ${c('GEN-FW:input-bfd')}`,
    );
  }

  if (allowedBgpRanges(config).v4.length > 0) {
    add(`chain=input action=accept protocol=tcp dst-port=179 ${srcList('bgp-allowed')} ${c('GEN-FW:input-bgp')}`);
  }

  const mgmtIface = config.interfaces.management.length > 0 ? ` ${ifaceList('management')}` : '';
  if (manage.sshRouter) {
    add(
      `chain=input action=accept protocol=tcp dst-port=22 ${srcList('management')}${mgmtIface} ${c('GEN-FW:input-ssh')}`,
    );
  }
  if (manage.winboxRouter) {
    add(
      `chain=input action=accept protocol=tcp dst-port=8291 ${srcList('management')}${mgmtIface} ${c('GEN-FW:input-winbox')}`,
    );
  }
  if (manage.snmpServers.length > 0) {
    add(
      `chain=input action=accept protocol=udp dst-port=161 ${srcList('snmp-allowed')} ${c('GEN-FW:input-snmp')}`,
    );
  }
  if (manage.allowLanDns) {
    const lanIface = config.interfaces.lan.length > 0 ? ` ${ifaceList('lan')}` : '';
    add(`chain=input action=accept protocol=udp dst-port=53${lanIface} ${c('GEN-FW:input-dns-udp')}`);
    add(`chain=input action=accept protocol=tcp dst-port=53${lanIface} ${c('GEN-FW:input-dns-tcp')}`);
  }
  if (config.interfaces.discovery.length > 0) {
    add(
      `chain=input action=accept protocol=udp dst-port=5678 ${ifaceList('mndp-allowed')} ${c('GEN-FW:input-mndp')}`,
    );
  }
  if (config.firewall.allowDhcpServer) {
    const lanIface = config.interfaces.lan.length > 0 ? ` ${ifaceList('lan')}` : '';
    add(`chain=input action=accept protocol=udp dst-port=67${lanIface} ${c('GEN-FW:input-dhcp-server')}`);
  }
  if (config.firewall.allowVrrp) {
    add(
      `chain=input action=accept protocol=vrrp dst-address=224.0.0.18 ${c('GEN-FW:input-vrrp')}`,
    );
  }
  if (config.firewall.extraInputTcp.trim()) {
    add(
      `chain=input action=accept protocol=tcp dst-port=${config.firewall.extraInputTcp.trim()} ${c('GEN-FW:input-extra-tcp')}`,
    );
  }
  if (config.firewall.extraInputUdp.trim()) {
    add(
      `chain=input action=accept protocol=udp dst-port=${config.firewall.extraInputUdp.trim()} ${c('GEN-FW:input-extra-udp')}`,
    );
  }

  if (config.firewall.inputPolicy === 'drop') {
    add(
      `chain=input action=drop${dropOptions(config, 'GEN-FW input drop:')} disabled=yes ${c('GEN-FW:input-default-drop')}`,
    );
  }
  return rules;
}

function statefulForwardRules(config: Config): string[] {
  const rules: string[] = [];
  const add = (rule: string) => rules.push(`/ip firewall filter add ${rule}`);
  add(`chain=forward action=accept connection-state=established,related ${c('GEN-FW:forward-established')}`);
  add(`chain=forward action=drop connection-state=invalid ${c('GEN-FW:forward-invalid')}`);
  if (config.management.sshForwardRanges.length > 0) {
    add(
      `chain=forward action=accept protocol=tcp dst-port=22 ${srcList('ssh-allowed')} ${c('GEN-FW:forward-ssh')}`,
    );
  }
  if (config.firewall.forwardPolicy === 'drop') {
    add(
      `chain=forward action=drop${dropOptions(config, 'GEN-FW forward drop:')} disabled=yes ${c('GEN-FW:forward-default-drop')}`,
    );
  }
  return rules;
}

function statefulRules(config: Config): string {
  if (config.firewall.mode !== 'stateful') return '';
  const v4 = [...statefulInputRules(config), '', ...statefulForwardRules(config)];
  return lines(
    '# --- IPv4 firewall filter --------------------------------------------------',
    ...v4,
    '#',
    '# The default-drop rules above start disabled. Run 90-finalize.rsc only',
    '# after management access and BGP sessions have been verified.',
  );
}

function statelessRouterServiceRules(config: Config): string[] {
  const rules: string[] = [];
  const add = (rule: string) => rules.push(`/ip firewall raw add ${rule}`);
  const services = config.firewall.statelessRouterServices;

  if (services.includes('dns')) {
    add(
      `chain=prerouting action=accept protocol=udp src-port=53 ${srcList('dns-allowed')} dst-address-type=local ${c('GEN-FW:raw-dns-reply')}`,
    );
  }
  if (services.includes('ntp')) {
    add(
      `chain=prerouting action=accept protocol=udp src-port=123 ${srcList('ntp-servers')} dst-address-type=local ${c('GEN-FW:raw-ntp-reply')}`,
    );
  }
  if (services.includes('mikrotik-update')) {
    add(
      `chain=prerouting action=accept protocol=tcp src-port=80,443 ${srcList('mik-update')} dst-address-type=local ${c('GEN-FW:raw-update-reply')}`,
    );
  }
  if (services.includes('ssh-client')) {
    add(
      `chain=prerouting action=accept protocol=tcp src-port=22 dst-port=1024-65535 dst-address-type=local ${c('GEN-FW:raw-ssh-client-reply')}`,
    );
  }
  if (services.includes('smtp')) {
    add(
      `chain=prerouting action=accept protocol=tcp src-port=25 dst-port=1024-65535 dst-address-type=local ${c('GEN-FW:raw-smtp-reply')}`,
    );
  }
  if (services.includes('syslog')) {
    rules.push('# Syslog is outbound-only; no reply rule is required.');
  }
  if (services.includes('snmp-traps')) {
    rules.push('# SNMP traps are outbound-only; no reply rule is required.');
  }
  return rules;
}

function statelessRules(config: Config): string {
  if (config.firewall.mode !== 'stateless') return '';
  const manage = config.management;
  const rules: string[] = [];
  const add = (rule: string) => rules.push(`/ip firewall raw add ${rule}`);

  rules.push('# --- IPv4 stateless raw ACL ------------------------------------------------');
  if (config.interfaces.ospf.length > 0) {
    add(`chain=prerouting action=accept protocol=ospf ${ifaceList('ospf-neighbours')} ${c('GEN-FW:raw-ospf')}`);
  }
  if (config.interfaces.bfd.length > 0) {
    add(
      `chain=prerouting action=accept protocol=udp dst-port=3784,4784 ${ifaceList('bfd-neighbours')} ${c('GEN-FW:raw-bfd')}`,
    );
  }
  if (allowedBgpRanges(config).v4.length > 0) {
    add(
      `chain=prerouting action=accept protocol=tcp dst-port=179 ${srcList('bgp-allowed')} ${c('GEN-FW:raw-bgp-input')}`,
    );
    add(
      `chain=prerouting action=accept protocol=tcp src-port=179 ${srcList('bgp-allowed')} ${c('GEN-FW:raw-bgp-reply')}`,
    );
  }

  const mgmtIface = config.interfaces.management.length > 0 ? ` ${ifaceList('management')}` : '';
  if (manage.sshRouter) {
    add(
      `chain=prerouting action=accept dst-address-type=local protocol=tcp dst-port=22 ${srcList('management')}${mgmtIface} ${c('GEN-FW:raw-ssh')}`,
    );
  }
  if (manage.winboxRouter) {
    add(
      `chain=prerouting action=accept dst-address-type=local protocol=tcp dst-port=8291 ${srcList('management')}${mgmtIface} ${c('GEN-FW:raw-winbox')}`,
    );
  }
  if (manage.snmpServers.length > 0) {
    add(
      `chain=prerouting action=accept dst-address-type=local protocol=udp dst-port=161 ${srcList('snmp-allowed')} ${c('GEN-FW:raw-snmp')}`,
    );
  }
  add(
    `chain=prerouting action=accept dst-address-type=local protocol=icmp ${c('GEN-FW:raw-icmp')}`,
  );
  if (config.interfaces.discovery.length > 0) {
    add(
      `chain=prerouting action=accept protocol=udp dst-port=5678 ${ifaceList('mndp-allowed')} ${c('GEN-FW:raw-mndp')}`,
    );
  }
  if (config.firewall.allowDhcpServer) {
    const lanIface = config.interfaces.lan.length > 0 ? ` ${ifaceList('lan')}` : '';
    add(
      `chain=prerouting action=accept protocol=udp dst-port=67${lanIface} ${c('GEN-FW:raw-dhcp-server')}`,
    );
  }
  if (config.firewall.allowVrrp) {
    add(
      `chain=prerouting action=accept protocol=vrrp dst-address=224.0.0.18 ${c('GEN-FW:raw-vrrp')}`,
    );
  }
  if (config.firewall.extraInputTcp.trim()) {
    add(
      `chain=prerouting action=accept dst-address-type=local protocol=tcp dst-port=${config.firewall.extraInputTcp.trim()} ${c('GEN-FW:raw-extra-tcp')}`,
    );
  }
  if (config.firewall.extraInputUdp.trim()) {
    add(
      `chain=prerouting action=accept dst-address-type=local protocol=udp dst-port=${config.firewall.extraInputUdp.trim()} ${c('GEN-FW:raw-extra-udp')}`,
    );
  }

  rules.push(...statelessRouterServiceRules(config));

  if (manage.sshForwardRanges.length > 0) {
    add(
      `chain=prerouting action=accept dst-address-type=!local protocol=tcp dst-port=22 ${srcList('ssh-allowed')} ${c('GEN-FW:raw-ssh-forward')}`,
    );
  }

  if (config.interfaces.wan.length > 0) {
    add(
      `chain=prerouting action=drop protocol=tcp dst-port=22 ${ifaceList('wan')} ${c('GEN-FW:raw-drop-wan-ssh')}`,
    );
    add(
      `chain=prerouting action=drop dst-address-type=local protocol=udp dst-port=53,123,161 ${ifaceList('wan')} ${c('GEN-FW:raw-drop-wan-services')}`,
    );
    if (config.firewall.dropAmplificationPorts) {
      add(
        `chain=prerouting action=drop protocol=udp dst-port=19,137-139,445,1900,389,5000,10001,11211 ${ifaceList('wan')} ${c('GEN-FW:raw-drop-amplification-udp')}`,
      );
      add(
        `chain=prerouting action=drop protocol=tcp dst-port=137-139,445 ${ifaceList('wan')} ${c('GEN-FW:raw-drop-amplification-tcp')}`,
      );
    }
  }

  if (config.firewall.inputPolicy === 'drop') {
    add(
      `chain=prerouting action=drop dst-address-type=local${dropOptions(config, 'GEN-FW raw input drop:')} disabled=yes ${c('GEN-FW:input-default-drop')}`,
    );
  }

  return lines(
    ...rules,
    '#',
    '# Stateless mode cannot match established/related state. The rules above',
    '# cover the selected router-originated services, but a router-originated',
    '# TCP session to an unlisted destination port will still be dropped.',
  );
}

function ipv6FilterRules(config: Config): string {
  if (!config.addressFamilies.ipv6.enabled) return '';
  if (config.firewall.ipv6Mode === 'off') {
    return lines(
      '# --- IPv6 firewall ----------------------------------------------------------',
      '# IPv6 is enabled but IPv6 firewall generation is off. Input to the router',
      '# over IPv6 is unfiltered. This is a deliberate, dangerous choice.',
    );
  }
  if (config.firewall.mode === 'stateless') {
    return ipv6RawRules(config);
  }

  const manage = config.management;
  const rules: string[] = ['# --- IPv6 firewall filter ---------------------------------------------------'];
  const add = (rule: string) => rules.push(`/ipv6 firewall filter add ${rule}`);

  add(`chain=input action=accept connection-state=established,related ${c('GEN-FW:v6-input-established')}`);
  add(`chain=input action=drop connection-state=invalid ${c('GEN-FW:v6-input-invalid')}`);
  add(`chain=input action=accept protocol=icmpv6 ${c('GEN-FW:v6-input-icmpv6')}`);
  add(`chain=input action=accept protocol=udp src-port=547 dst-port=546 ${c('GEN-FW:v6-input-dhcpv6')}`);

  if (config.interfaces.ospf.length > 0) {
    add(`chain=input action=accept protocol=ospf ${ifaceList('ospf-neighbours')} ${c('GEN-FW:v6-input-ospf')}`);
  }
  if (config.interfaces.bfd.length > 0) {
    add(
      `chain=input action=accept protocol=udp dst-port=3784,4784 ${ifaceList('bfd-neighbours')} ${c('GEN-FW:v6-input-bfd')}`,
    );
  }
  if (allowedBgpRanges(config).v6.length > 0) {
    add(`chain=input action=accept protocol=tcp dst-port=179 ${srcList('bgp-allowed')} ${c('GEN-FW:v6-input-bgp')}`);
  }

  const mgmtIface = config.interfaces.management.length > 0 ? ` ${ifaceList('management')}` : '';
  if (manage.sshRouter) {
    add(
      `chain=input action=accept protocol=tcp dst-port=22 ${srcList('management')}${mgmtIface} ${c('GEN-FW:v6-input-ssh')}`,
    );
  }
  if (manage.winboxRouter) {
    add(
      `chain=input action=accept protocol=tcp dst-port=8291 ${srcList('management')}${mgmtIface} ${c('GEN-FW:v6-input-winbox')}`,
    );
  }
  if (manage.snmpServers.length > 0) {
    add(
      `chain=input action=accept protocol=udp dst-port=161 ${srcList('snmp-allowed')} ${c('GEN-FW:v6-input-snmp')}`,
    );
  }
  if (manage.allowLanDns) {
    const lanIface = config.interfaces.lan.length > 0 ? ` ${ifaceList('lan')}` : '';
    add(`chain=input action=accept protocol=udp dst-port=53${lanIface} ${c('GEN-FW:v6-input-dns-udp')}`);
    add(`chain=input action=accept protocol=tcp dst-port=53${lanIface} ${c('GEN-FW:v6-input-dns-tcp')}`);
  }
  if (config.interfaces.discovery.length > 0) {
    add(
      `chain=input action=accept protocol=udp dst-port=5678 ${ifaceList('mndp-allowed')} ${c('GEN-FW:v6-input-mndp')}`,
    );
  }
  if (config.firewall.allowDhcpv6Server) {
    const lanIface = config.interfaces.lan.length > 0 ? ` ${ifaceList('lan')}` : '';
    add(`chain=input action=accept protocol=udp dst-port=547${lanIface} ${c('GEN-FW:v6-input-dhcpv6-server')}`);
  }
  if (config.firewall.allowVrrp) {
    add(
      `chain=input action=accept protocol=vrrp dst-address=ff02::12 ${c('GEN-FW:v6-input-vrrp')}`,
    );
  }
  if (config.firewall.extraInputTcp.trim()) {
    add(
      `chain=input action=accept protocol=tcp dst-port=${config.firewall.extraInputTcp.trim()} ${c('GEN-FW:v6-input-extra-tcp')}`,
    );
  }
  if (config.firewall.extraInputUdp.trim()) {
    add(
      `chain=input action=accept protocol=udp dst-port=${config.firewall.extraInputUdp.trim()} ${c('GEN-FW:v6-input-extra-udp')}`,
    );
  }
  if (config.firewall.inputPolicy === 'drop') {
    add(
      `chain=input action=drop${dropOptions(config, 'GEN-FW v6 input drop:')} disabled=yes ${c('GEN-FW:input-default-drop')}`,
    );
  }

  if (config.firewall.ipv6Mode !== 'input-only') {
    add(`chain=forward action=accept connection-state=established,related ${c('GEN-FW:v6-forward-established')}`);
    add(`chain=forward action=drop connection-state=invalid ${c('GEN-FW:v6-forward-invalid')}`);
    if (config.management.sshForwardRanges.length > 0) {
      add(
        `chain=forward action=accept protocol=tcp dst-port=22 ${srcList('ssh-allowed')} ${c('GEN-FW:v6-forward-ssh')}`,
      );
    }
    if (config.firewall.forwardPolicy === 'drop') {
      add(
        `chain=forward action=drop${dropOptions(config, 'GEN-FW v6 forward drop:')} disabled=yes ${c('GEN-FW:forward-default-drop')}`,
      );
    }
  }

  return lines(...rules);
}

function ipv6RawRules(config: Config): string {
  const manage = config.management;
  const rules: string[] = ['# --- IPv6 stateless raw ACL ------------------------------------------------'];
  const add = (rule: string) => rules.push(`/ipv6 firewall raw add ${rule}`);

  if (config.interfaces.ospf.length > 0) {
    add(`chain=prerouting action=accept protocol=ospf ${ifaceList('ospf-neighbours')} ${c('GEN-FW:v6-raw-ospf')}`);
  }
  if (config.interfaces.bfd.length > 0) {
    add(
      `chain=prerouting action=accept protocol=udp dst-port=3784,4784 ${ifaceList('bfd-neighbours')} ${c('GEN-FW:v6-raw-bfd')}`,
    );
  }
  if (allowedBgpRanges(config).v6.length > 0) {
    add(
      `chain=prerouting action=accept protocol=tcp dst-port=179 ${srcList('bgp-allowed')} ${c('GEN-FW:v6-raw-bgp-input')}`,
    );
    add(
      `chain=prerouting action=accept protocol=tcp src-port=179 ${srcList('bgp-allowed')} ${c('GEN-FW:v6-raw-bgp-reply')}`,
    );
  }

  const mgmtIface = config.interfaces.management.length > 0 ? ` ${ifaceList('management')}` : '';
  if (manage.sshRouter) {
    add(
      `chain=prerouting action=accept dst-address-type=local protocol=tcp dst-port=22 ${srcList('management')}${mgmtIface} ${c('GEN-FW:v6-raw-ssh')}`,
    );
  }
  if (manage.winboxRouter) {
    add(
      `chain=prerouting action=accept dst-address-type=local protocol=tcp dst-port=8291 ${srcList('management')}${mgmtIface} ${c('GEN-FW:v6-raw-winbox')}`,
    );
  }
  if (manage.snmpServers.length > 0) {
    add(
      `chain=prerouting action=accept dst-address-type=local protocol=udp dst-port=161 ${srcList('snmp-allowed')} ${c('GEN-FW:v6-raw-snmp')}`,
    );
  }
  add(
    `chain=prerouting action=accept dst-address-type=local protocol=icmpv6 ${c('GEN-FW:v6-raw-icmpv6')}`,
  );
  if (config.interfaces.discovery.length > 0) {
    add(
      `chain=prerouting action=accept protocol=udp dst-port=5678 ${ifaceList('mndp-allowed')} ${c('GEN-FW:v6-raw-mndp')}`,
    );
  }
  if (config.firewall.allowDhcpv6Server) {
    const lanIface = config.interfaces.lan.length > 0 ? ` ${ifaceList('lan')}` : '';
    add(
      `chain=prerouting action=accept protocol=udp dst-port=547${lanIface} ${c('GEN-FW:v6-raw-dhcpv6-server')}`,
    );
  }
  if (config.firewall.allowVrrp) {
    add(
      `chain=prerouting action=accept protocol=vrrp dst-address=ff02::12 ${c('GEN-FW:v6-raw-vrrp')}`,
    );
  }
  if (config.firewall.extraInputTcp.trim()) {
    add(
      `chain=prerouting action=accept dst-address-type=local protocol=tcp dst-port=${config.firewall.extraInputTcp.trim()} ${c('GEN-FW:v6-raw-extra-tcp')}`,
    );
  }
  if (config.firewall.extraInputUdp.trim()) {
    add(
      `chain=prerouting action=accept dst-address-type=local protocol=udp dst-port=${config.firewall.extraInputUdp.trim()} ${c('GEN-FW:v6-raw-extra-udp')}`,
    );
  }

  const services = config.firewall.statelessRouterServices;
  if (services.includes('dns')) {
    add(
      `chain=prerouting action=accept protocol=udp src-port=53 ${srcList('dns-allowed')} dst-address-type=local ${c('GEN-FW:v6-raw-dns-reply')}`,
    );
  }
  if (services.includes('ntp')) {
    add(
      `chain=prerouting action=accept protocol=udp src-port=123 ${srcList('ntp-servers')} dst-address-type=local ${c('GEN-FW:v6-raw-ntp-reply')}`,
    );
  }
  if (services.includes('mikrotik-update')) {
    add(
      `chain=prerouting action=accept protocol=tcp src-port=80,443 ${srcList('mik-update')} dst-address-type=local ${c('GEN-FW:v6-raw-update-reply')}`,
    );
  }
  if (services.includes('ssh-client')) {
    add(
      `chain=prerouting action=accept protocol=tcp src-port=22 dst-port=1024-65535 dst-address-type=local ${c('GEN-FW:v6-raw-ssh-client-reply')}`,
    );
  }
  if (services.includes('smtp')) {
    add(
      `chain=prerouting action=accept protocol=tcp src-port=25 dst-port=1024-65535 dst-address-type=local ${c('GEN-FW:v6-raw-smtp-reply')}`,
    );
  }

  if (config.interfaces.wan.length > 0) {
    add(
      `chain=prerouting action=drop protocol=tcp dst-port=22 ${ifaceList('wan')} ${c('GEN-FW:v6-raw-drop-wan-ssh')}`,
    );
    add(
      `chain=prerouting action=drop dst-address-type=local protocol=udp dst-port=53,123,161 ${ifaceList('wan')} ${c('GEN-FW:v6-raw-drop-wan-services')}`,
    );
  }

  if (config.firewall.inputPolicy === 'drop') {
    add(
      `chain=prerouting action=drop dst-address-type=local${dropOptions(config, 'GEN-FW v6 raw input drop:')} disabled=yes ${c('GEN-FW:input-default-drop')}`,
    );
  }
  return lines(...rules);
}

function cleanupCommands(): string {
  return lines(
    '# --- Remove objects generated by the previous run ---------------------------',
    '/ip firewall filter remove [find where comment~"^GEN-FW:"]',
    '/ip firewall raw remove [find where comment~"^GEN-FW:"]',
    '/ipv6 firewall filter remove [find where comment~"^GEN-FW:"]',
    '/ipv6 firewall raw remove [find where comment~"^GEN-FW:"]',
    '/ip firewall address-list remove [find where comment~"^GEN-FW:"]',
    '/ipv6 firewall address-list remove [find where comment~"^GEN-FW:"]',
    '/interface list member remove [find where comment~"^GEN-FW:member"]',
  );
}

export function generateFirewallFile(
  config: Config,
  meta: GenerationMeta,
): GeneratedFile {
  const notes: string[] = [];
  if (config.firewall.mode === 'stateless') {
    notes.push('STATELESS MODE: connection tracking is disabled; NAT will not work.');
  }
  if (config.firewall.inputPolicy === 'accept') {
    notes.push('Default input policy is accept; the default-drop rule is not generated.');
  }
  if (config.interfaces.wan.length === 0) {
    notes.push('No WAN interfaces selected; WAN-specific drops are omitted.');
  }
  if (config.addressFamilies.ipv6.enabled && config.firewall.ipv6Mode === 'off') {
    notes.push('IPv6 is enabled but the IPv6 firewall is disabled.');
  }

  const content = lines(
    generatedHeader(meta, 'Edge firewall', notes),
    cleanupCommands(),
    interfaceListDefinitions(),
    interfaceListMembers(config),
    addressListCommands(config),
    serviceCommands(config),
    systemCommands(config),
    ndCommands(config),
    statefulRules(config),
    statelessRules(config),
    ipv6FilterRules(config),
    ':log info "GEN: firewall imported; default-drop rules are still disabled"',
  );
  return {
    name: '10-firewall.rsc',
    content: content + '\n',
    language: 'routeros',
    description: 'Services, interface lists, address lists, IPv4/IPv6 firewall rules.',
  };
}

export function generateFinalizeFile(meta: GenerationMeta): GeneratedFile {
  const guards = [
    ['/ip firewall filter', 'GEN-FW:input-default-drop'],
    ['/ip firewall filter', 'GEN-FW:forward-default-drop'],
    ['/ipv6 firewall filter', 'GEN-FW:input-default-drop'],
    ['/ipv6 firewall filter', 'GEN-FW:forward-default-drop'],
    ['/ip firewall raw', 'GEN-FW:input-default-drop'],
    ['/ipv6 firewall raw', 'GEN-FW:input-default-drop'],
  ] as const;
  const commands = guards.map(
    ([path, comment]) =>
      `:if ([:len [${path} find where comment=${q(comment)}]] > 0) do={ ${path} set [find where comment=${q(comment)}] disabled=no }`,
  );
  const content = lines(
    generatedHeader(meta, 'Finalize: enable default-deny', [
      'Run this only after management access and BGP sessions are verified.',
      'It enables the default-drop rules generated disabled in 10-firewall.rsc.',
    ]),
    '# --- Enable generated default-drop rules ------------------------------------',
    ...commands,
    ':log info "GEN: default-deny enabled"',
  );
  return {
    name: '90-finalize.rsc',
    content: content + '\n',
    language: 'routeros',
    description: 'Enables the generated default-drop rules after verification.',
  };
}
