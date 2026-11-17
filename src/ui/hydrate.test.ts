import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../generator/defaults';
import { hydrateConfig } from './hydrate';

describe('config hydration', () => {
  it('returns defaults for malformed input', () => {
    expect(hydrateConfig(undefined)).toEqual(createDefaultConfig());
    expect(hydrateConfig('nope')).toEqual(createDefaultConfig());
    expect(hydrateConfig(null)).toEqual(createDefaultConfig());
  });

  it('merges partial input over the defaults', () => {
    const config = hydrateConfig({
      router: { name: 'edge', asn: '65000' },
      addressFamilies: { ipv4: { prefixes: ['192.0.2.0/24'] } },
      transits: 'not-an-array',
      firewall: { mode: 'stateless' },
    });
    expect(config.router.name).toBe('edge');
    expect(config.router.routerId).toBe('');
    expect(config.addressFamilies.ipv4.prefixes).toEqual(['192.0.2.0/24']);
    expect(config.addressFamilies.ipv4.advertiseLengths).toBe('22-24');
    expect(config.transits).toEqual([]);
    expect(config.firewall.mode).toBe('stateless');
    expect(config.firewall.inputPolicy).toBe('drop');
  });

  it('hydrates transit and custom peer entries with defaults', () => {
    const config = hydrateConfig({
      transits: [{ name: 'ipt', asn: '65001' }],
      peering: { customPeers: [{ name: 'peer-1' }] },
    });
    expect(config.transits[0].kind).toBe('primary');
    expect(config.transits[0].defaultRoute).toBe(true);
    expect(config.transits[0].maxPrefixesV4).toBe('1500000');
    expect(config.peering.customPeers[0].fabric).toBe('ct');
    expect(config.peering.customPeers[0].maxPrefixesV4).toBe('250000');
  });

  it('forces the current RouterOS target on older configs', () => {
    const config = hydrateConfig({ router: { targetVersion: '7.19+' } });
    expect(config.router.targetVersion).toBe('7.20+');
  });

  it('keeps existing RPKI groups when the imported list is incomplete', () => {
    const config = hydrateConfig({ rpki: { enabled: false } });
    expect(config.rpki.enabled).toBe(false);
    expect(config.rpki.groups).toHaveLength(2);
    expect(config.rpki.groups[0].groupName).toBe('NAPCT');
  });
});
