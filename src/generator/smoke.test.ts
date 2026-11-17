import { describe, expect, it } from 'vitest';
import { FIXED_META_DATE, minimalConfig, sampleConfig, statelessConfig } from './fixtures';
import { generatePackage } from './output';

describe('generated package', () => {
  it('generates and lints the full sample without errors', () => {
    const result = generatePackage(sampleConfig(), FIXED_META_DATE);
    const errors = [
      ...result.issues.filter((issue) => issue.level === 'error'),
      ...result.lint.filter((issue) => issue.level === 'error'),
    ];
    if (errors.length > 0) {
      console.log(JSON.stringify(errors, null, 2));
    }
    expect(errors).toEqual([]);
    expect(result.files.map((file) => file.name)).toEqual([
      '00-preflight.rsc',
      '10-firewall.rsc',
      '20-bgp.rsc',
      '90-finalize.rsc',
      'README.txt',
      'config.json',
    ]);
  });

  it('generates the stateless variant', () => {
    const result = generatePackage(statelessConfig(), FIXED_META_DATE);
    const errors = [
      ...result.issues.filter((issue) => issue.level === 'error'),
      ...result.lint.filter((issue) => issue.level === 'error'),
    ];
    if (errors.length > 0) console.log(JSON.stringify(errors, null, 2));
    expect(errors).toEqual([]);
  });

  it('generates the minimal firewall-only variant', () => {
    const result = generatePackage(minimalConfig(), FIXED_META_DATE);
    const errors = [
      ...result.issues.filter((issue) => issue.level === 'error'),
      ...result.lint.filter((issue) => issue.level === 'error'),
    ];
    if (errors.length > 0) console.log(JSON.stringify(errors, null, 2));
    expect(errors).toEqual([]);
  });
});
