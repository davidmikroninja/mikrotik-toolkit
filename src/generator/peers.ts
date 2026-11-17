import { findPeerGroup, FABRICS } from './catalog';
import { parseAddress, parsePrefix, type Family } from './net';
import type { Config } from './types';
import { uniqueSorted } from './utils';

export interface PeerEndpoint {
  address: string;
  family: Family;
  owner: string;
}

/**
 * Every address that can originate a BGP session or a BGP keepalive for this
 * configuration. The firewall allowlist is derived from this list, so the two
 * generated files can never disagree about who is allowed to reach port 179.
 */
export function peerEndpoints(config: Config): PeerEndpoint[] {
  const endpoints: PeerEndpoint[] = [];
  const push = (address: string, owner: string) => {
    const trimmed = address.trim();
    if (!trimmed) return;
    const parsed = parseAddress(trimmed);
    if (!parsed) return;
    endpoints.push({ address: trimmed, family: parsed.family, owner });
  };

  config.transits.forEach((transit) => {
    push(transit.v4, `${transit.name} transit`);
    push(transit.v6, `${transit.name} transit`);
  });

  (['ct', 'jb'] as const).forEach((fabric) => {
    const selection = config.peering[fabric];
    if (selection.routeServers) {
      FABRICS[fabric].routeServers.forEach((session) => {
        push(session.v4, `${FABRICS[fabric].shortLabel} route server`);
        push(session.v6, `${FABRICS[fabric].shortLabel} route server`);
      });
    }
    selection.bilaterals.forEach((groupId) => {
      const group = findPeerGroup(groupId);
      group?.sessions.forEach((session) => {
        push(session.v4, `${group.name} (${FABRICS[fabric].shortLabel})`);
        push(session.v6, `${group.name} (${FABRICS[fabric].shortLabel})`);
      });
    });
  });

  config.peering.customPeers.forEach((peer) => {
    push(peer.v4, `${peer.name} (${FABRICS[peer.fabric].shortLabel})`);
    push(peer.v6, `${peer.name} (${FABRICS[peer.fabric].shortLabel})`);
  });

  return endpoints;
}

export interface AllowedRanges {
  v4: string[];
  v6: string[];
}

export function allowedBgpRanges(config: Config): AllowedRanges {
  const v4: string[] = [];
  const v6: string[] = [];
  peerEndpoints(config).forEach((endpoint) => {
    if (endpoint.family === 4) v4.push(endpoint.address);
    else v6.push(endpoint.address);
  });
  config.management.extraBgpAllowed.forEach((range) => {
    const prefix = parsePrefix(range);
    if (!prefix) return;
    if (prefix.family === 4) v4.push(range);
    else v6.push(range);
  });
  return { v4: uniqueSorted(v4), v6: uniqueSorted(v6) };
}

export function splitByFamily(values: string[]): AllowedRanges {
  const v4: string[] = [];
  const v6: string[] = [];
  values.forEach((value) => {
    const parsed = parsePrefix(value);
    if (!parsed) return;
    if (parsed.family === 4) v4.push(value);
    else v6.push(value);
  });
  return { v4: uniqueSorted(v4), v6: uniqueSorted(v6) };
}

export function splitIpByFamily(values: string[]): AllowedRanges {
  const v4: string[] = [];
  const v6: string[] = [];
  values.forEach((value) => {
    const parsed = parseAddress(value);
    if (!parsed) return;
    if (parsed.family === 4) v4.push(value);
    else v6.push(value);
  });
  return { v4: uniqueSorted(v4), v6: uniqueSorted(v6) };
}
