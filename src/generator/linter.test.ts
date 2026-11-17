import { describe, expect, it } from 'vitest';
import { lintRouterOS } from './linter';
import { FIXED_META_DATE, sampleConfig, statelessConfig } from './fixtures';
import { generatePackage } from './output';

describe('RouterOS linter', () => {
  it('accepts every generated file', () => {
    for (const config of [sampleConfig(), statelessConfig()]) {
      const result = generatePackage(config, FIXED_META_DATE);
      const errors = result.lint.filter((issue) => issue.level === 'error');
      expect(errors).toEqual([]);
    }
  });

  it('detects an unmatched closing brace', () => {
    const issues = lintRouterOS('add action=drop\n}\n');
    expect(issues.some((issue) => issue.message.includes('Unmatched'))).toBe(true);
  });

  it('detects pre-7.20 and singular-template syntax', () => {
    const issues = lintRouterOS(
      [
        '/routing bgp template add name=t address-families=ip',
        '/routing bgp connection add name=c template=t',
      ].join('\n'),
    );
    expect(issues.some((issue) => issue.message.includes('afi='))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('templates='))).toBe(true);
  });

  it('detects the own-prefix /32 bug', () => {
    const issues = lintRouterOS(
      '/routing filter rule add chain=x rule="if (dst-len >= 32) { reject; }"',
    );
    expect(issues.some((issue) => issue.message.includes('Own-prefix'))).toBe(true);
  });

  it('detects undefined chains and templates', () => {
    const issues = lintRouterOS(
      [
        '/routing filter rule add chain=a rule="jump missing;"',
        '/routing bgp connection add name=c templates=missing-template',
      ].join('\n'),
    );
    expect(issues.some((issue) => issue.message.includes('missing"'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('missing-template'))).toBe(true);
  });

  it('detects router-id on a BGP template', () => {
    const issues = lintRouterOS('/routing bgp template add name=t router-id=192.0.2.1');
    expect(issues.some((issue) => issue.message.includes('/routing id'))).toBe(true);
  });

  it('detects a v6 template pointing at the v4 network list', () => {
    const issues = lintRouterOS(
      '/routing bgp template add name=t afi=ipv6 output.network=bgp-networks-v4',
    );
    expect(issues.some((issue) => issue.message.includes('IPv6 template'))).toBe(true);
  });

  it('detects duplicate template and connection names', () => {
    const issues = lintRouterOS(
      [
        '/routing bgp template add name=t',
        '/routing bgp template add name=t',
        '/routing bgp connection add name=c',
        '/routing bgp connection add name=c',
      ].join('\n'),
    );
    expect(issues.some((issue) => issue.message.includes('Duplicate BGP template'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('Duplicate BGP connection'))).toBe(true);
  });
});
