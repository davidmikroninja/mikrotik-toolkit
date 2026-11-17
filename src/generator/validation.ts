import { findPeerGroup, FABRICS } from './catalog';
import {
  addressInPrefix,
  isCIDR,
  isIP,
  isIpOrHostname,
  normalizePrefix,
  parseAddress,
  parseLengthRange,
  parsePrefix,
  prefixesOverlap,
  type Family,
  type Prefix,
} from './net';
import {
  SCHEMA_VERSION,
  TARGET_ROUTEROS,
  type Config,
  type Transit,
  type ValidationIssue,
} from './types';
import { parseInteger, slug } from './utils';

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

function add(
  issues: ValidationIssue[],
  level: 'error' | 'warning',
  field: string,
  message: string,
): void {
  issues.push({ level, field, message });
}

function asnNumber(value: string): number | null {
  const parsed = parseInteger(value);
  if (parsed === null || parsed < 1 || parsed > 4294967295) return null;
  return parsed;
}

function isPrivateAsn(asn: number): boolean {
  return (
    (asn >= 64512 && asn <= 65534) ||
    (asn >= 4200000000 && asn <= 4294967294)
  );
}

function isDocumentationAsn(asn: number): boolean {
  return (asn >= 64496 && asn <= 64511) || (asn >= 65536 && asn <= 65551);
}

function isReservedAsn(asn: number): boolean {
  return asn === 23456 || asn === 65535 || asn === 4294967295;
}

function isPublicPrefix(prefix: Prefix): boolean {
  if (prefix.family === 4) {
    const firstOctet = Number((prefix.first >> 24n) & 0xffn);
    const secondOctet = Number((prefix.first >> 16n) & 0xffn);
    if (firstOctet === 0 || firstOctet === 10 || firstOctet === 127) return false;
    if (firstOctet >= 224) return false;
    if (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) return false;
    if (firstOctet === 192 && secondOctet === 168) return false;
    if (firstOctet === 100 && secondOctet >= 64 && secondOctet <= 127) return false;
    if (firstOctet === 169 && secondOctet === 254) return false;
    if (firstOctet === 192 && secondOctet === 0) return false;
    if (firstOctet === 198 && (secondOctet === 18 || secondOctet === 19)) return false;
    if (
      (firstOctet === 192 && secondOctet === 0) ||
      (firstOctet === 198 && secondOctet === 51) ||
      (firstOctet === 203 && secondOctet === 0)
    ) {
      return false;
    }
    return true;
  }
  // IPv6 global-unicast, excluding ULA/link-local/documentation/multicast.
  if (prefix.first < 0x2000n) return false;
  if (prefix.first >> 120n === 0xffn) return false; // ff00::/8
  if (prefix.first >> 121n === 0b1111110n) return false; // fc00::/7
  if (prefix.first >> 118n === 0b1111111010n) return false; // fe80::/10
  if (prefix.first >> 96n === BigInt('0x20010db8')) return false; // 2001:db8::/32
  return true;
}

function isUsablePeerAddress(value: string): boolean {
  const parsed = parseAddress(value);
  if (!parsed) return false;
  if (parsed.family === 4) {
    if (parsed.value === 0n) return false;
    if (parsed.value >> 24n === 0n) return false; // 0/8
    if (parsed.value >> 24n === 127n) return false; // loopback
    if (parsed.value >= 0xe0000000n) return false; // multicast + reserved
    return true;
  }
  if (parsed.value === 0n || parsed.value === 1n) return false;
  if (parsed.value >> 120n === 0xffn) return false; // ff00::/8
  return true;
}

interface CheckedPrefix {
  input: string;
  normalized: string;
  prefix: Prefix;
}

function checkPrefixes(
  values: string[],
  family: Family,
  field: string,
  issues: ValidationIssue[],
): CheckedPrefix[] {
  const checked: CheckedPrefix[] = [];
  const seen = new Map<string, number>();
  values.forEach((value, index) => {
    const at = `${field}.${index}`;
    if (!value.trim()) {
      add(issues, 'error', at, 'Prefix is empty.');
      return;
    }
    const prefix = parsePrefix(value);
    if (!prefix) {
      add(issues, 'error', at, `"${value}" is not a valid ${family === 4 ? 'IPv4' : 'IPv6'} prefix.`);
      return;
    }
    if (prefix.family !== family) {
      add(issues, 'error', at, `Expected an IPv${family} prefix, got "${value}".`);
      return;
    }
    if (prefix.length === 0) {
      add(issues, 'error', at, 'The default route cannot be advertised as an owned prefix.');
      return;
    }
    const normalized = normalizePrefix(value) ?? value.trim();
    const previous = seen.get(normalized);
    if (previous !== undefined) {
      add(
        issues,
        'warning',
        at,
        `Duplicate of entry ${previous + 1} ("${normalized}"); the duplicate will be ignored.`,
      );
      return;
    }
    seen.set(normalized, index);
    if (normalized !== value.trim().toLowerCase()) {
      add(
        issues,
        'warning',
        at,
        `Host bits are set; use the network address "${normalized}" instead.`,
      );
    }
    if (!isPublicPrefix(prefix)) {
      add(
        issues,
        'warning',
        at,
        `"${normalized}" is private, reserved, or documentation space; upstream networks will reject it.`,
      );
    }
    checked.push({ input: value, normalized, prefix });
  });

  for (let i = 0; i < checked.length; i += 1) {
    for (let j = i + 1; j < checked.length; j += 1) {
      if (prefixesOverlap(checked[i].prefix, checked[j].prefix)) {
        add(
          issues,
          'warning',
          `${field}.${j}`,
          `"${checked[j].normalized}" overlaps "${checked[i].normalized}". Both entries will be originated and both get a blackhole route when no exact route exists, so a more-specific blackhole can override a real path. Verify the blackhole list before importing.`,
        );
      }
    }
  }

  return checked;
}

function checkAsn(
  value: string,
  field: string,
  issues: ValidationIssue[],
  localAsn: number | null,
): number | null {
  if (!value.trim()) {
    add(issues, 'error', field, 'ASN is required.');
    return null;
  }
  const asn = asnNumber(value);
  if (asn === null) {
    add(issues, 'error', field, 'ASN must be an integer between 1 and 4294967295.');
    return null;
  }
  if (isReservedAsn(asn)) {
    add(issues, 'error', field, `AS${asn} is reserved and cannot be used here.`);
    return asn;
  }
  if (isPrivateAsn(asn)) {
    add(
      issues,
      'warning',
      field,
      `AS${asn} is a private ASN; public networks will reject announcements carrying it.`,
    );
  } else if (isDocumentationAsn(asn)) {
    add(
      issues,
      'warning',
      field,
      `AS${asn} is reserved for documentation; use your real ASN before deployment.`,
    );
  }
  if (localAsn !== null && asn === localAsn) {
    add(issues, 'error', field, 'The remote ASN cannot equal the local ASN (iBGP is not supported).');
  }
  return asn;
}

function checkPeerAddress(
  value: string,
  field: string,
  issues: ValidationIssue[],
  required: boolean,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) add(issues, 'error', field, 'Peer address is required for this address family.');
    return null;
  }
  if (trimmed.includes('/')) {
    add(issues, 'error', field, 'Use a plain IP address, not a prefix.');
    return null;
  }
  if (!isIP(trimmed)) {
    add(issues, 'error', field, `"${trimmed}" is not a valid IP address.`);
    return null;
  }
  if (!isUsablePeerAddress(trimmed)) {
    add(issues, 'error', field, `"${trimmed}" is not a usable BGP peer address.`);
    return null;
  }
  return trimmed;
}

function checkLocalPref(
  value: string,
  field: string,
  issues: ValidationIssue[],
): number | null {
  const parsed = parseInteger(value);
  if (parsed === null || parsed > 4294967295) {
    add(issues, 'error', field, 'Local preference must be an integer between 0 and 4294967295.');
    return null;
  }
  return parsed;
}

function checkMaxPrefixes(
  value: string,
  field: string,
  issues: ValidationIssue[],
): number | null {
  if (!value.trim()) return null;
  const parsed = parseInteger(value);
  if (parsed === null || parsed < 1) {
    add(issues, 'error', field, 'Maximum prefixes must be a positive integer or empty.');
    return null;
  }
  return parsed;
}

function checkTransit(
  transit: Transit,
  index: number,
  config: Config,
  issues: ValidationIssue[],
  localAsn: number | null,
  haveV4: boolean,
): void {
  const base = `transits.${index}`;
  const name = transit.name.trim();
  if (!name) {
    add(issues, 'error', `${base}.name`, 'Transit name is required.');
  } else if (!SAFE_NAME.test(name)) {
    add(
      issues,
      'error',
      `${base}.name`,
      'Use only letters, digits, dot, underscore, and hyphen (no spaces).',
    );
  }

  checkAsn(transit.asn, `${base}.asn`, issues, localAsn);
  const v4 = checkPeerAddress(transit.v4, `${base}.v4`, issues, false);
  const v6 = checkPeerAddress(transit.v6, `${base}.v6`, issues, false);
  if (!v4 && !v6) {
    add(issues, 'error', base, 'At least one peer address (IPv4 or IPv6) is required.');
  }
  if (v4 && !haveV4) {
    add(
      issues,
      'warning',
      `${base}.v4`,
      'No IPv4 prefix is configured; this IPv4 session will not be generated.',
    );
  }
  if (v6 && !config.addressFamilies.ipv6.enabled) {
    add(
      issues,
      'warning',
      `${base}.v6`,
      'IPv6 is disabled; this IPv6 session will not be generated.',
    );
  }

  checkLocalPref(transit.defaultLocalPref, `${base}.defaultLocalPref`, issues);
  checkLocalPref(transit.routesLocalPref, `${base}.routesLocalPref`, issues);
  checkMaxPrefixes(transit.maxPrefixesV4, `${base}.maxPrefixesV4`, issues);
  checkMaxPrefixes(transit.maxPrefixesV6, `${base}.maxPrefixesV6`, issues);
}

function collectPeerAddresses(config: Config): Array<{ address: string; owner: string }> {
  const peers: Array<{ address: string; owner: string }> = [];
  config.transits.forEach((transit) => {
    if (isIP(transit.v4.trim())) peers.push({ address: transit.v4.trim(), owner: transit.name });
    if (isIP(transit.v6.trim())) peers.push({ address: transit.v6.trim(), owner: transit.name });
  });
  (['ct', 'jb'] as const).forEach((fabric) => {
    const selection = config.peering[fabric];
    if (selection.routeServers) {
      FABRICS[fabric].routeServers.forEach((session) => {
        peers.push({ address: session.v4, owner: `${fabric} route server` });
        peers.push({ address: session.v6, owner: `${fabric} route server` });
      });
    }
    selection.bilaterals.forEach((groupId) => {
      const group = findPeerGroup(groupId);
      group?.sessions.forEach((session) => {
        peers.push({ address: session.v4, owner: group.name });
        peers.push({ address: session.v6, owner: group.name });
      });
    });
  });
  config.peering.customPeers.forEach((peer) => {
    if (isIP(peer.v4.trim())) peers.push({ address: peer.v4.trim(), owner: peer.name });
    if (isIP(peer.v6.trim())) peers.push({ address: peer.v6.trim(), owner: peer.name });
  });
  return peers;
}

export function validateConfig(config: Config): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { ipv4, ipv6 } = config.addressFamilies;

  if (config.schemaVersion !== SCHEMA_VERSION) {
    add(
      issues,
      'warning',
      'schemaVersion',
      `Input schema ${config.schemaVersion} differs from this generator (${SCHEMA_VERSION}); review the fields after loading.`,
    );
  }
  if (config.router.targetVersion !== TARGET_ROUTEROS) {
    add(
      issues,
      'error',
      'router.targetVersion',
      `This generator targets RouterOS ${TARGET_ROUTEROS}; set the target accordingly.`,
    );
  }

  // Router identity ---------------------------------------------------------
  if (!config.router.name.trim()) {
    add(issues, 'error', 'router.name', 'Router name is required (used in comments and file names).');
  } else if (/["\\$\r\n]/.test(config.router.name)) {
    add(issues, 'error', 'router.name', 'Router name must not contain quotes, backslashes, dollar signs, or newlines.');
  }

  const localAsn = checkAsn(config.router.asn, 'router.asn', issues, null);

  const routerId = config.router.routerId.trim();
  if (!routerId) {
    add(issues, 'error', 'router.routerId', 'BGP router ID is required.');
  } else {
    const parsed = parseAddress(routerId);
    if (!parsed || parsed.family !== 4) {
      add(issues, 'error', 'router.routerId', 'Router ID must be a valid IPv4 address.');
    } else {
      const value = parsed.value;
      if (value >> 24n === 0n || value >> 24n === 127n) {
        add(issues, 'error', 'router.routerId', 'Router ID cannot be 0.0.0.0/8 or 127.0.0.0/8.');
      } else if (value >= 0xe0000000n) {
        add(issues, 'error', 'router.routerId', 'Router ID cannot be multicast or reserved space.');
      }
    }
  }

  // Prefixes ---------------------------------------------------------------
  const v4Prefixes = checkPrefixes(
    ipv4.prefixes,
    4,
    'addressFamilies.ipv4.prefixes',
    issues,
  );
  const v6Prefixes = ipv6.enabled
    ? checkPrefixes(ipv6.prefixes, 6, 'addressFamilies.ipv6.prefixes', issues)
    : [];

  if (ipv4.prefixes.length === 0 && (!ipv6.enabled || ipv6.prefixes.length === 0)) {
    add(
      issues,
      'error',
      'addressFamilies.ipv4.prefixes',
      'At least one IPv4 or IPv6 prefix is required so BGP has something to originate.',
    );
  }
  if (!ipv6.enabled && ipv6.prefixes.some((value) => value.trim() !== '')) {
    add(
      issues,
      'warning',
      'addressFamilies.ipv6.enabled',
      'IPv6 is disabled; the entered IPv6 prefixes will be ignored.',
    );
  }
  if (ipv6.enabled && ipv6.prefixes.length === 0) {
    add(issues, 'error', 'addressFamilies.ipv6.prefixes', 'IPv6 is enabled but no IPv6 prefix is listed.');
  }

  const v4Range = parseLengthRange(ipv4.advertiseLengths, 32);
  if (v4Range === null) {
    add(
      issues,
      'error',
      'addressFamilies.ipv4.advertiseLengths',
      'Use a range like "22-24" or a single length like "24" (0-32).',
    );
  } else if (
    v4Prefixes.length > 0 &&
    !v4Prefixes.some(
      (entry) => entry.prefix.length >= v4Range.min && entry.prefix.length <= v4Range.max,
    )
  ) {
    add(
      issues,
      'warning',
      'addressFamilies.ipv4.advertiseLengths',
      'No listed IPv4 prefix length falls inside the advertise range.',
    );
  }
  ipv4.prefixes.forEach((value, index) => {
    if (!v4Range) return;
    const prefix = parsePrefix(value);
    if (prefix && (prefix.length > v4Range.max || prefix.length < v4Range.min)) {
      add(
        issues,
        'warning',
        `addressFamilies.ipv4.prefixes.${index}`,
        `This prefix is /${prefix.length}, outside the advertise range ${ipv4.advertiseLengths}; it will not be announced.`,
      );
    }
  });

  if (ipv4.rejectLongerThan.trim()) {
    const reject = parseInteger(ipv4.rejectLongerThan);
    if (reject === null || reject > 32) {
      add(
        issues,
        'error',
        'addressFamilies.ipv4.rejectLongerThan',
        'Inbound prefix-length limit must be 0-32 or empty.',
      );
    } else if (reject === 0) {
      add(
        issues,
        'warning',
        'addressFamilies.ipv4.rejectLongerThan',
        'A limit of 0 rejects every inbound prefix longer than /0, i.e. almost all routes.',
      );
    }
  }

  const v6Range = parseLengthRange(ipv6.advertiseLengths, 128);
  if (ipv6.enabled && v6Range === null) {
    add(
      issues,
      'error',
      'addressFamilies.ipv6.advertiseLengths',
      'Use a range like "32-48" or a single length like "48" (0-128).',
    );
  }
  if (ipv6.enabled && v6Range && v6Prefixes.length > 0) {
    if (
      !v6Prefixes.some(
        (entry) => entry.prefix.length >= v6Range.min && entry.prefix.length <= v6Range.max,
      )
    ) {
      add(
        issues,
        'warning',
        'addressFamilies.ipv6.advertiseLengths',
        'No listed IPv6 prefix length falls inside the advertise range.',
      );
    }
    v6Prefixes.forEach((entry, index) => {
      if (entry.prefix.length > v6Range.max || entry.prefix.length < v6Range.min) {
        add(
          issues,
          'warning',
          `addressFamilies.ipv6.prefixes.${index}`,
          `This prefix is /${entry.prefix.length}, outside the advertise range ${ipv6.advertiseLengths}; it will not be announced.`,
        );
      }
    });
  }
  if (ipv6.enabled && ipv6.rejectLongerThan.trim()) {
    const reject = parseInteger(ipv6.rejectLongerThan);
    if (reject === null || reject > 128) {
      add(
        issues,
        'error',
        'addressFamilies.ipv6.rejectLongerThan',
        'Inbound prefix-length limit must be 0-128 or empty.',
      );
    }
  }

  // Router ID should be reachable via one of the announced prefixes.
  if (routerId && v4Prefixes.length > 0 && isIP(routerId)) {
    const inside = v4Prefixes.some((entry) => addressInPrefix(routerId, entry.normalized));
    if (!inside) {
      add(
        issues,
        'warning',
        'router.routerId',
        'Router ID is not inside an announced IPv4 prefix. A loopback address is usually a better choice.',
      );
    }
  }

  // Transits ---------------------------------------------------------------
  const transitNames = new Map<string, number>();
  const transitSlugs = new Map<string, number>();
  config.transits.forEach((transit, index) => {
    checkTransit(
      transit,
      index,
      config,
      issues,
      localAsn,
      v4Prefixes.length > 0,
    );
    const key = transit.name.trim().toLowerCase();
    if (key) {
      const previous = transitNames.get(key);
      if (previous !== undefined) {
        add(
          issues,
          'error',
          `transits.${index}.name`,
          `Duplicate transit name (also used by transit ${previous + 1}).`,
        );
      } else {
        transitNames.set(key, index);
      }
      const slugKey = slug(key);
      const slugPrevious = transitSlugs.get(slugKey);
      if (slugPrevious !== undefined) {
        add(
          issues,
          'error',
          `transits.${index}.name`,
          `This name produces the same generated identifier as transit ${slugPrevious + 1}; choose a more distinct name.`,
        );
      } else {
        transitSlugs.set(slugKey, index);
      }
    }
  });

  // Peering ----------------------------------------------------------------
  (['ct', 'jb'] as const).forEach((fabric) => {
    const selection = config.peering[fabric];
    selection.bilaterals.forEach((groupId, index) => {
      const group = findPeerGroup(groupId);
      if (!group) {
        add(
          issues,
          'error',
          `peering.${fabric}.bilaterals.${index}`,
          `Unknown peer group "${groupId}".`,
        );
      } else if (group.fabric !== fabric) {
        add(
          issues,
          'error',
          `peering.${fabric}.bilaterals.${index}`,
          `${group.name} is a ${FABRICS[group.fabric].shortLabel} peer, not ${FABRICS[fabric].shortLabel}.`,
        );
      }
    });
  });

  const customNames = new Map<string, number>();
  const customSlugs = new Map<string, number>();
  config.peering.customPeers.forEach((peer, index) => {
    const base = `peering.customPeers.${index}`;
    if (!peer.name.trim()) {
      add(issues, 'error', `${base}.name`, 'Peer name is required.');
    } else if (!SAFE_NAME.test(peer.name.trim())) {
      add(issues, 'error', `${base}.name`, 'Use only letters, digits, dot, underscore, and hyphen.');
    }
    const key = peer.name.trim().toLowerCase();
    if (key) {
      const previous = customNames.get(key);
      if (previous !== undefined) {
        add(issues, 'error', `${base}.name`, `Duplicate peer name (also used by peer ${previous + 1}).`);
      } else {
        customNames.set(key, index);
      }
      const slugKey = slug(key);
      const slugPrevious = customSlugs.get(slugKey);
      if (slugPrevious !== undefined) {
        add(
          issues,
          'error',
          `${base}.name`,
          `This name produces the same generated identifier as peer ${slugPrevious + 1}; choose a more distinct name.`,
        );
      } else {
        customSlugs.set(slugKey, index);
      }
    }
    checkAsn(peer.asn, `${base}.asn`, issues, localAsn);
    if (peer.fabric !== 'ct' && peer.fabric !== 'jb') {
      add(issues, 'error', `${base}.fabric`, 'Select NAP Cape Town or NAP Johannesburg.');
    }
    const v4 = checkPeerAddress(peer.v4, `${base}.v4`, issues, false);
    const v6 = checkPeerAddress(peer.v6, `${base}.v6`, issues, false);
    if (!v4 && !v6) add(issues, 'error', base, 'At least one peer address is required.');
    if (v4 && v4Prefixes.length === 0) {
      add(
        issues,
        'warning',
        `${base}.v4`,
        'No IPv4 prefix is configured; this IPv4 session will not be generated.',
      );
    }
    if (v6 && v6Prefixes.length === 0) {
      add(
        issues,
        'warning',
        `${base}.v6`,
        'No IPv6 prefix is configured; this IPv6 session will not be generated.',
      );
    }
    checkLocalPref(peer.localPref, `${base}.localPref`, issues);
    checkMaxPrefixes(peer.maxPrefixesV4, `${base}.maxPrefixesV4`, issues);
    checkMaxPrefixes(peer.maxPrefixesV6, `${base}.maxPrefixesV6`, issues);
  });

  const hasPeering =
    config.transits.length > 0 ||
    config.peering.customPeers.length > 0 ||
    config.peering.ct.routeServers ||
    config.peering.jb.routeServers ||
    config.peering.ct.bilaterals.length > 0 ||
    config.peering.jb.bilaterals.length > 0;
  if (!hasPeering) {
    add(
      issues,
      'warning',
      'transits',
      'No BGP peers or transits are configured; 20-bgp.rsc will contain only the cleanup block.',
    );
  }

  // Duplicate peer addresses across objects.
  const peerAddresses = collectPeerAddresses(config);
  const addressOwners = new Map<string, string>();
  peerAddresses.forEach(({ address, owner }) => {
    const existing = addressOwners.get(address);
    if (existing !== undefined && existing !== owner) {
      add(
        issues,
        'warning',
        'transits',
        `Peer address ${address} is used by both "${existing}" and "${owner}".`,
      );
    } else {
      addressOwners.set(address, owner);
    }
  });

  // RPKI -------------------------------------------------------------------
  if (config.rpki.enabled) {
    const enabledGroups = config.rpki.groups.filter((group) => group.enabled);
    if (enabledGroups.length === 0) {
      add(issues, 'error', 'rpki.groups', 'RPKI is enabled but no group is enabled.');
    }
    const groupNames = new Map<string, number>();
    config.rpki.groups.forEach((group, index) => {
      const base = `rpki.groups.${index}`;
      if (!group.enabled) return;
      if (!group.groupName.trim()) {
        add(issues, 'error', `${base}.groupName`, 'RouterOS RPKI group name is required.');
      } else if (!SAFE_NAME.test(group.groupName.trim())) {
        add(issues, 'error', `${base}.groupName`, 'Use only letters, digits, dot, underscore, and hyphen.');
      }
      const key = group.groupName.trim().toLowerCase();
      if (key) {
        const previous = groupNames.get(key);
        if (previous !== undefined) {
          add(issues, 'error', `${base}.groupName`, `Duplicate RPKI group name (also used by group ${previous + 1}).`);
        } else {
          groupNames.set(key, index);
        }
      }
      if (group.servers.length === 0) {
        add(issues, 'error', `${base}.servers`, 'At least one RTR server is required.');
      }
      group.servers.forEach((server, serverIndex) => {
        if (!server.trim()) {
          add(issues, 'error', `${base}.servers.${serverIndex}`, 'RTR server is empty.');
        } else if (!isIP(server.trim())) {
          add(issues, 'error', `${base}.servers.${serverIndex}`, `"${server}" is not a valid IP address.`);
        }
      });
      const port = parseInteger(group.port);
      if (port === null || port < 1 || port > 65535) {
        add(issues, 'error', `${base}.port`, 'Port must be an integer between 1 and 65535.');
      }
    });

    const napSelected =
      config.peering.ct.routeServers ||
      config.peering.jb.routeServers ||
      config.peering.ct.bilaterals.length > 0 ||
      config.peering.jb.bilaterals.length > 0 ||
      config.peering.customPeers.length > 0;
    if (!napSelected && !config.rpki.enforceOnTransits) {
      add(
        issues,
        'warning',
        'rpki.enabled',
        'RPKI is enabled but no IXP/bilateral sessions or transit enforcement will use it.',
      );
    }
    if (config.rpki.enforceOnTransits && config.transits.length === 0) {
      add(
        issues,
        'warning',
        'rpki.enforceOnTransits',
        'RPKI transit enforcement is on but there are no transit sessions.',
      );
    }

    (['ct', 'jb'] as const).forEach((fabric) => {
      const usesFabric =
        config.peering[fabric].routeServers ||
        config.peering[fabric].bilaterals.length > 0 ||
        config.peering.customPeers.some((peer) => peer.fabric === fabric);
      if (!usesFabric) return;
      const expected = FABRICS[fabric].rpkiGroup;
      const group = config.rpki.groups.find((item) => item.groupName === expected);
      if (!group || !group.enabled) {
        add(
          issues,
          'warning',
          `rpki.groups`,
          `${FABRICS[fabric].shortLabel} peers are selected but the ${expected} RPKI group is disabled; those sessions will not be RPKI-validated.`,
        );
      }
    });
  }

  // Interfaces -------------------------------------------------------------
  const manage = config.management;
  const inputDrops = config.firewall.inputPolicy === 'drop';
  if (inputDrops && manage.ranges.length === 0) {
    add(
      issues,
      'error',
      'management.ranges',
      'The input policy is drop but no management range is defined. Add a CIDR or the router will lock you out.',
    );
  }
  if (inputDrops && config.interfaces.management.length === 0) {
    add(
      issues,
      'warning',
      'interfaces.management',
      'No management interfaces are selected; router services will be matched by source address only.',
    );
  }
  if (inputDrops && config.interfaces.wan.length === 0) {
    add(
      issues,
      'warning',
      'interfaces.wan',
      'No WAN interfaces are selected; WAN-specific drops will be omitted.',
    );
  }
  if (config.interfaces.wan.some((name) => config.interfaces.lan.includes(name))) {
    add(
      issues,
      'warning',
      'interfaces.wan',
      'An interface is listed as both WAN and LAN; check the assignments.',
    );
  }
  if (manage.allowLanDns && config.interfaces.lan.length === 0) {
    add(
      issues,
      'warning',
      'management.allowLanDns',
      'LAN DNS is enabled but no LAN interfaces are selected; DNS will be allowed from every interface.',
    );
  }
  if (config.firewall.ndMode === 'disable-wan' && config.interfaces.wan.length === 0) {
    add(
      issues,
      'warning',
      'firewall.ndMode',
      'WAN ND disabling is selected but no WAN interfaces are listed.',
    );
  }

  // Management -------------------------------------------------------------
  manage.ranges.forEach((range, index) => {
    if (!range.trim()) {
      add(issues, 'error', `management.ranges.${index}`, 'Management range is empty.');
    } else if (!isCIDR(range)) {
      add(issues, 'error', `management.ranges.${index}`, `"${range}" is not a valid CIDR.`);
    } else {
      const prefix = parsePrefix(range);
      if (prefix && prefix.length === 0) {
        add(
          issues,
          'warning',
          `management.ranges.${index}`,
          'This allows management from the entire internet.',
        );
      }
    }
  });
  manage.sshForwardRanges.forEach((range, index) => {
    if (!range.trim() || !isCIDR(range)) {
      add(
        issues,
        'error',
        `management.sshForwardRanges.${index}`,
        `"${range}" is not a valid CIDR.`,
      );
    }
  });
  manage.snmpServers.forEach((server, index) => {
    if (!server.trim() || !isCIDR(server)) {
      add(
        issues,
        'error',
        `management.snmpServers.${index}`,
        `"${server}" is not a valid IP address or CIDR.`,
      );
    }
  });
  manage.extraBgpAllowed.forEach((range, index) => {
    if (!range.trim() || !isCIDR(range)) {
      add(
        issues,
        'error',
        `management.extraBgpAllowed.${index}`,
        `"${range}" is not a valid IP address or CIDR.`,
      );
    }
  });
  manage.dnsUpstreams.forEach((server, index) => {
    if (!server.trim() || !isIP(server)) {
      add(
        issues,
        'error',
        `management.dnsUpstreams.${index}`,
        `"${server}" is not a valid IP address.`,
      );
    }
  });
  manage.ntpServers.forEach((server, index) => {
    if (!server.trim() || !isIpOrHostname(server)) {
      add(
        issues,
        'error',
        `management.ntpServers.${index}`,
        `"${server}" is not a valid IP address or hostname.`,
      );
    }
  });
  if (manage.allowLanDns && manage.dnsUpstreams.length === 0) {
    add(
      issues,
      'error',
      'management.dnsUpstreams',
      'At least one upstream DNS server is required when the router serves DNS.',
    );
  }
  if (manage.sshRouter || manage.winboxRouter) {
    if (manage.ranges.length === 0) {
      add(
        issues,
        'warning',
        'management.ranges',
        'SSH/Winbox are enabled without a management range; service-level address restrictions will be omitted.',
      );
    }
  }

  // Firewall policy --------------------------------------------------------
  const firewall = config.firewall;
  if (firewall.mode === 'stateless') {
    add(
      issues,
      'warning',
      'firewall.mode',
      'Stateless mode disables connection tracking. NAT will not work, and router-originated TCP sessions can break unless every reply path is explicitly allowed.',
    );
    if (firewall.forwardPolicy === 'drop') {
      add(
        issues,
        'error',
        'firewall.forwardPolicy',
        'Stateless mode cannot enforce a stateful forward policy; use stateful mode for a forward default-deny.',
      );
    }
    if (firewall.statelessRouterServices.length === 0) {
      add(
        issues,
        'warning',
        'firewall.statelessRouterServices',
        'No router-originated reply services are selected; the stateless default-deny can break DNS, NTP, and updates.',
      );
    }
    if (firewall.statelessRouterServices.includes('ssh-client')) {
      add(
        issues,
        'warning',
        'firewall.statelessRouterServices',
        'Outbound SSH-client replies use arbitrary remote ports and cannot be matched reliably without conntrack.',
      );
    }
  }
  if (firewall.inputPolicy === 'accept') {
    add(
      issues,
      'warning',
      'firewall.inputPolicy',
      'The input default policy is accept; the generated rules are advisory rather than a default-deny firewall.',
    );
  }
  if (firewall.ipv6Mode === 'off' && ipv6.enabled) {
    add(
      issues,
      'warning',
      'firewall.ipv6Mode',
      'IPv6 is enabled but no IPv6 firewall will be generated; IPv6 input is unfiltered.',
    );
  }
  if (firewall.ipv6Mode !== 'off' && !ipv6.enabled) {
    add(
      issues,
      'warning',
      'firewall.ipv6Mode',
      'IPv6 is disabled; the IPv6 firewall option will have no effect.',
    );
  }
  if (firewall.icmpRateLimitMs.trim()) {
    const rate = parseInteger(firewall.icmpRateLimitMs);
    if (rate === null) {
      add(issues, 'error', 'firewall.icmpRateLimitMs', 'ICMP rate limit must be an integer in milliseconds.');
    } else if (rate < 50) {
      add(
        issues,
        'warning',
        'firewall.icmpRateLimitMs',
        'A value below 50 ms can suppress legitimate ICMP diagnostics.',
      );
    }
  }

  const checkPorts = (value: string, field: string, label: string) => {
    if (!value.trim()) return;
    const pattern = /^\d{1,5}(?:-\d{1,5})?(?:,\d{1,5}(?:-\d{1,5})?)*$/;
    if (!pattern.test(value.trim())) {
      add(issues, 'error', field, `${label} must be a comma-separated list of ports or ranges, e.g. 500,4500,51820.`);
      return;
    }
    value.split(',').forEach((part) => {
      const [start, end] = part.split('-').map((item) => Number(item));
      if (start < 1 || start > 65535 || (end !== undefined && (end < start || end > 65535))) {
        add(issues, 'error', field, `${label} contains an invalid port or range: ${part}.`);
      }
    });
    add(
      issues,
      'warning',
      field,
      `${label} will be accepted from every interface. Add interface/source restrictions manually if the service is not public.`,
    );
  };
  checkPorts(firewall.extraInputTcp, 'firewall.extraInputTcp', 'Extra TCP ports');
  checkPorts(firewall.extraInputUdp, 'firewall.extraInputUdp', 'Extra UDP ports');
  if (firewall.allowDhcpServer && config.interfaces.lan.length === 0) {
    add(
      issues,
      'warning',
      'firewall.allowDhcpServer',
      'DHCP server is enabled but no LAN interfaces are selected; DHCP requests will be accepted on every interface.',
    );
  }
  if (config.addressFamilies.ipv6.enabled) {
    const hasV6Management = manage.ranges.some((range) => {
      const prefix = parsePrefix(range);
      return prefix?.family === 6;
    });
    if ((manage.sshRouter || manage.winboxRouter) && !hasV6Management) {
      add(
        issues,
        'warning',
        'management.ranges',
        'IPv6 is enabled and SSH/Winbox are on, but no IPv6 management range is configured. IPv6 management is denied until you add one.',
      );
    }
    const hasV6Snmp = manage.snmpServers.some((server) => {
      const prefix = parsePrefix(server);
      return prefix?.family === 6;
    });
    if (manage.snmpServers.length > 0 && !hasV6Snmp) {
      add(
        issues,
        'warning',
        'management.snmpServers',
        'No IPv6 SNMP source is configured; IPv6 SNMP queries will be denied.',
      );
    }
  }

  // Priorities -------------------------------------------------------------
  const priorityFields: Array<[keyof Config['priorities'], string]> = [
    ['transitDefault', 'Transit default'],
    ['transitBackupDefault', 'Backup transit default'],
    ['transitRoutes', 'Transit routes'],
    ['transitBackupRoutes', 'Backup transit routes'],
    ['napCt', 'NAP CT'],
    ['napJb', 'NAP JB'],
    ['blpCt', 'BLP CT'],
    ['blpJb', 'BLP JB'],
  ];
  const priorities: Record<string, number | null> = {};
  priorityFields.forEach(([key, label]) => {
    const parsed = parseInteger(config.priorities[key]);
    if (parsed === null || parsed > 4294967295) {
      add(issues, 'error', `priorities.${key}`, `${label} local preference must be an integer.`);
    }
    priorities[key] = parsed;
  });
  if (
    priorities.transitDefault !== null &&
    priorities.transitBackupDefault !== null &&
    priorities.transitBackupDefault >= priorities.transitDefault
  ) {
    add(
      issues,
      'warning',
      'priorities.transitBackupDefault',
      'The backup transit default preference should be lower than the primary (lower values are less preferred).',
    );
  }

  return issues;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.level === 'error');
}
