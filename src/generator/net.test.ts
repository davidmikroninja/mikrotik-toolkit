import { describe, expect, it } from 'vitest';
import {
  isCIDR,
  isHostname,
  isIP,
  normalizePrefix,
  parseIPv6,
  parseLengthRange,
  parsePrefix,
  prefixesOverlap,
} from './net';

describe('address parsing', () => {
  it('validates IPv4 and IPv6 addresses', () => {
    expect(isIP('192.0.2.1')).toBe(true);
    expect(isIP('999.1.1.1')).toBe(false);
    expect(isIP('2001:db8::1')).toBe(true);
    expect(isIP('::ffff:192.0.2.1')).toBe(true);
    expect(isIP('2001:db8:::1')).toBe(false);
    expect(isIP('2001:db8::1::2')).toBe(false);
    expect(parseIPv6('::1')).toBe(1n);
  });

  it('normalizes prefixes to the network address', () => {
    expect(normalizePrefix('192.0.2.129/24')).toBe('192.0.2.0/24');
    expect(normalizePrefix('2001:db8:1::/32')).toBe('2001:db8::/32');
    expect(normalizePrefix('2001:db8::/48')).toBe('2001:db8::/48');
    expect(normalizePrefix('not-a-prefix')).toBeNull();
  });

  it('rejects prefixes with an invalid length', () => {
    expect(isCIDR('192.0.2.0/33')).toBe(false);
    expect(isCIDR('2001:db8::/129')).toBe(false);
    expect(isCIDR('192.0.2.0/32')).toBe(true);
  });

  it('detects overlaps', () => {
    const a = parsePrefix('192.0.2.0/24')!;
    const b = parsePrefix('192.0.2.128/25')!;
    const c = parsePrefix('198.51.100.0/24')!;
    expect(prefixesOverlap(a, b)).toBe(true);
    expect(prefixesOverlap(a, c)).toBe(false);
  });

  it('parses prefix-length ranges with a family-specific maximum', () => {
    expect(parseLengthRange('22-24', 32)).toEqual({ min: 22, max: 24 });
    expect(parseLengthRange('24', 32)).toEqual({ min: 24, max: 24 });
    expect(parseLengthRange('48-64', 128)).toEqual({ min: 48, max: 64 });
    expect(parseLengthRange('25-22', 32)).toBeNull();
    expect(parseLengthRange('22-24', 128)).toEqual({ min: 22, max: 24 });
  });

  it('validates hostnames for NTP and update lists', () => {
    expect(isHostname('pool.ntp.org')).toBe(true);
    expect(isHostname('update.mikrotik.com')).toBe(true);
    expect(isHostname('bad host')).toBe(false);
    expect(isHostname('-bad.example')).toBe(false);
  });
});
