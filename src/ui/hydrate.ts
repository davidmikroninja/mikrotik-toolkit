import { createDefaultConfig, newCustomPeer, newTransit } from '../generator/defaults';
import { SCHEMA_VERSION, TARGET_ROUTEROS, type Config } from '../generator/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function merge<T extends object>(base: T, value: unknown): T {
  return isRecord(value) ? { ...base, ...(value as Partial<T>) } : base;
}

/**
 * Merge an imported or stored configuration over the defaults. Missing fields
 * from older versions keep working, and malformed top-level values fall back
 * to safe defaults instead of crashing the form.
 */
export function hydrateConfig(raw: unknown): Config {
  const base = createDefaultConfig();
  if (!isRecord(raw)) return base;

  const addressFamilies = isRecord(raw.addressFamilies) ? raw.addressFamilies : {};
  const peering = isRecord(raw.peering) ? raw.peering : {};
  const rpki = isRecord(raw.rpki) ? raw.rpki : {};
  const interfaces = isRecord(raw.interfaces) ? raw.interfaces : {};
  const management = isRecord(raw.management) ? raw.management : {};
  const firewall = isRecord(raw.firewall) ? raw.firewall : {};
  const priorities = isRecord(raw.priorities) ? raw.priorities : {};

  const transits = Array.isArray(raw.transits)
    ? raw.transits.map((transit) => merge(newTransit(), transit))
    : base.transits;

  const customPeers = Array.isArray(peering.customPeers)
    ? peering.customPeers.map((peer) => merge(newCustomPeer(), peer))
    : base.peering.customPeers;

  const rpkiGroups = Array.isArray(rpki.groups)
    ? rpki.groups.map((group, index) =>
        merge(base.rpki.groups[index] ?? base.rpki.groups[0], group),
      )
    : base.rpki.groups;

  return {
    ...base,
    ...(raw as Partial<Config>),
    schemaVersion: SCHEMA_VERSION,
    // The generator emits one syntax family; never inherit an older target.
    router: { ...merge(base.router, raw.router), targetVersion: TARGET_ROUTEROS },
    addressFamilies: {
      ipv4: merge(base.addressFamilies.ipv4, addressFamilies.ipv4),
      ipv6: merge(base.addressFamilies.ipv6, addressFamilies.ipv6),
    },
    transits,
    peering: {
      ct: merge(base.peering.ct, peering.ct),
      jb: merge(base.peering.jb, peering.jb),
      customPeers,
    },
    rpki: {
      ...merge(base.rpki, rpki),
      groups: rpkiGroups,
    },
    interfaces: merge(base.interfaces, interfaces),
    management: merge(base.management, management),
    firewall: merge(base.firewall, firewall),
    priorities: merge(base.priorities, priorities),
  };
}
