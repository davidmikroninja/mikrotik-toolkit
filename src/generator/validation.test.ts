import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from './defaults';
import { minimalConfig, sampleConfig } from './fixtures';
import { validateConfig } from './validation';

function errorsOf(config: ReturnType<typeof sampleConfig>) {
  return validateConfig(config).filter((issue) => issue.level === 'error');
}

describe('config validation', () => {
  it('accepts the full sample with warnings only', () => {
    const issues = validateConfig(sampleConfig());
    expect(issues.filter((issue) => issue.level === 'error')).toEqual([]);
    expect(issues.some((issue) => issue.level === 'warning')).toBe(true);
  });

  it('accepts a firewall-only configuration', () => {
    expect(errorsOf(minimalConfig())).toEqual([]);
  });

  it('requires an ASN, router name and router ID', () => {
    const config = createDefaultConfig();
    const fields = validateConfig(config)
      .filter((issue) => issue.level === 'error')
      .map((issue) => issue.field);
    expect(fields).toContain('router.name');
    expect(fields).toContain('router.asn');
    expect(fields).toContain('router.routerId');
  });

  it('rejects a prefix from the wrong family', () => {
    const config = sampleConfig();
    config.addressFamilies.ipv4.prefixes = ['2001:db8::/32'];
    expect(errorsOf(config).some((issue) => issue.field.includes('ipv4.prefixes'))).toBe(true);
  });

  it('rejects IPv6 enabled with no IPv6 prefix', () => {
    const config = sampleConfig();
    config.addressFamilies.ipv6.prefixes = [];
    expect(errorsOf(config).some((issue) => issue.field === 'addressFamilies.ipv6.prefixes')).toBe(true);
  });

  it('rejects an empty management range with an input default-deny', () => {
    const config = sampleConfig();
    config.management.ranges = [];
    expect(errorsOf(config).some((issue) => issue.field === 'management.ranges')).toBe(true);
  });

  it('rejects stateless mode with a forward default-deny', () => {
    const config = sampleConfig();
    config.firewall.mode = 'stateless';
    config.firewall.forwardPolicy = 'drop';
    expect(errorsOf(config).some((issue) => issue.field === 'firewall.forwardPolicy')).toBe(true);
  });

  it('rejects a bilateral peer selected on the wrong fabric', () => {
    const config = sampleConfig();
    config.peering.ct.bilaterals = ['netflix'];
    expect(errorsOf(config).some((issue) => issue.field.includes('bilaterals'))).toBe(true);
  });

  it('rejects duplicate transit names and slug collisions', () => {
    const config = sampleConfig();
    const duplicate = { ...config.transits[0] };
    duplicate.name = 'ipt.primary';
    config.transits.push({ ...config.transits[0], name: 'ipt-primary' });
    config.transits.push(duplicate);
    const errors = errorsOf(config);
    expect(errors.some((issue) => issue.field === 'transits.1.name')).toBe(true);
    expect(errors.some((issue) => issue.message.includes('same generated identifier'))).toBe(true);
  });

  it('rejects bad extra-port syntax', () => {
    const config = sampleConfig();
    config.firewall.extraInputTcp = '99999';
    expect(errorsOf(config).some((issue) => issue.field === 'firewall.extraInputTcp')).toBe(true);
    config.firewall.extraInputTcp = '500-4500';
    expect(errorsOf(config).some((issue) => issue.field === 'firewall.extraInputTcp')).toBe(false);
  });

  it('rejects RPKI enabled with an empty group', () => {
    const config = sampleConfig();
    config.rpki.groups[0].servers = [];
    expect(errorsOf(config).some((issue) => issue.field === 'rpki.groups.0.servers')).toBe(true);
  });

  it('rejects a private ASN used as the local and remote ASN', () => {
    const config = sampleConfig();
    config.transits[0].asn = config.router.asn;
    const errors = errorsOf(config);
    expect(errors.some((issue) => issue.field === 'transits.0.asn')).toBe(true);
  });

  it('rejects reserved ASNs', () => {
    const config = sampleConfig();
    config.router.asn = '23456';
    expect(errorsOf(config).some((issue) => issue.field === 'router.asn')).toBe(true);
  });

  it('rejects the default route as an owned prefix', () => {
    const config = sampleConfig();
    config.addressFamilies.ipv4.prefixes = ['0.0.0.0/0'];
    expect(errorsOf(config).some((issue) => issue.field.includes('ipv4.prefixes'))).toBe(true);
  });
});
