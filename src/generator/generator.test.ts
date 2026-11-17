import { describe, expect, it } from 'vitest';
import {
  FIXED_META_DATE,
  minimalConfig,
  sampleConfig,
  statelessConfig,
} from './fixtures';
import { generatePackage } from './output';
import type { GeneratedFile } from './types';

function file(files: GeneratedFile[], name: string): string {
  const match = files.find((entry) => entry.name === name);
  if (!match) throw new Error(`missing ${name}`);
  return match.content;
}

describe('firewall generator', () => {
  const result = generatePackage(sampleConfig(), FIXED_META_DATE);
  const firewall = file(result.files, '10-firewall.rsc');
  const finalize = file(result.files, '90-finalize.rsc');

  it('stages the default-drop rule disabled and finalizes it', () => {
    expect(firewall).toMatch(/GEN-FW:input-default-drop/);
    expect(firewall).toMatch(/action=drop.*disabled=yes/);
    expect(finalize).toContain('GEN-FW:input-default-drop');
    expect(finalize).toContain('disabled=no');
  });

  it('derives the BGP allowlist from every selected peer', () => {
    ['203.0.113.1', '196.60.70.1', '196.60.9.1', '196.60.70.113', '198.51.100.9'].forEach(
      (address) => {
        expect(firewall).toContain(`address="${address}"`);
      },
    );
  });

  it('generates IPv4 and IPv6 firewall rules when IPv6 is enabled', () => {
    expect(firewall).toContain('/ipv6 firewall filter add');
    expect(firewall).toContain('protocol=icmpv6');
    expect(firewall).toContain('dst-port=67');
    expect(firewall).toContain('dst-port=547');
  });

  it('avoids the undefined ssh-allowed-in list and negative interface matches', () => {
    expect(firewall).not.toContain('ssh-allowed-in');
    expect(firewall).not.toMatch(/in-interface-list=!/);
  });

  it('does not disable connection tracking in stateful mode', () => {
    expect(firewall).toContain('/ip firewall connection tracking set enabled=auto');
    expect(firewall).not.toContain('/ip firewall connection tracking set enabled=no');
  });

  it('uses the valid 7.24 cloud DDNS enum', () => {
    expect(firewall).toContain('/ip cloud set ddns-enabled=auto');
    expect(firewall).not.toContain('ddns-enabled=no');
  });

  it('skips built-in service-port modules instead of aborting the import', () => {
    expect(firewall).toContain(':foreach sp in=[/ip firewall service-port find]');
    expect(firewall).toContain('on-error=');
    expect(firewall).not.toContain('/ip firewall service-port set [find] disabled=yes');
  });

  it('allows discovery on the configured MNDP interfaces', () => {
    expect(firewall).toContain('dst-port=5678');
    expect(firewall).toContain('mndp-allowed');
  });

  it('hardens the reverse proxy and bandwidth server services', () => {
    expect(firewall).toContain('/ip service set reverse-proxy disabled=yes');
    expect(firewall).toContain('/tool bandwidth-server set enabled=no');
  });

  it('generates the stateless variant with raw rules and conntrack off', () => {
    const stateless = generatePackage(statelessConfig(), FIXED_META_DATE);
    const content = file(stateless.files, '10-firewall.rsc');
    expect(content).toContain('/ip firewall connection tracking set enabled=no');
    expect(content).toContain('/ip firewall raw add');
    expect(content).not.toContain('/ip firewall filter add chain=input');
    expect(content).toContain('src-port=80,443');
    expect(stateless.lint.filter((issue) => issue.level === 'error')).toEqual([]);
  });
});

describe('BGP generator', () => {
  const result = generatePackage(sampleConfig(), FIXED_META_DATE);
  const bgp = file(result.files, '20-bgp.rsc');

  it('uses RouterOS 7.20 afi syntax', () => {
    expect(bgp).toContain('afi=ip ');
    expect(bgp).toContain('afi=ipv6');
    expect(bgp).not.toContain('address-families=');
  });

  it('creates a BGP instance with the router ID and uses it on every connection', () => {
    expect(bgp).toContain(
      '/routing/bgp/instance add name=gen-main as=65000 router-id=192.0.2.1 routing-table=main',
    );
    const connections = bgp.split('\n').filter((line) => line.includes('/routing/bgp/connection add'));
    expect(connections.length).toBeGreaterThan(0);
    connections.forEach((line) => expect(line).toContain('instance=gen-main'));
    expect(bgp).not.toMatch(/\/routing\/bgp\/(template|connection) add[^\n]*router-id=/);
  });

  it('points IPv6 templates at the IPv6 network list', () => {
    const ipv6Templates = bgp
      .split('\n')
      .filter((line) => line.includes('afi=ipv6') && line.includes('template add'));
    expect(ipv6Templates.length).toBeGreaterThan(0);
    ipv6Templates.forEach((line) => {
      expect(line).toContain('output.network=bgp-networks-v6');
      expect(line).not.toContain('output.network=bgp-networks-v4');
    });
  });

  it('uses templates= and never the singular template=', () => {
    expect(bgp).toContain('templates=gen-nap-ct-v4');
    expect(bgp).not.toMatch(/\btemplate=/);
  });

  it('applies RPKI in the generated input chains', () => {
    expect(bgp).toContain('rule="rpki-verify NAPCT"');
    expect(bgp).toContain('rule="rpki-verify NAPJB"');
    expect(bgp).toContain('if (rpki invalid)');
  });

  it('rejects the whole own prefix, not only /32 host routes', () => {
    expect(bgp).toContain('if (dst in bgp-networks-v4) { reject; }');
    expect(bgp).toContain('if (dst in bgp-networks-v6) { reject; }');
    expect(bgp).not.toMatch(/dst-len\s*>=\s*(32|128)/);
  });

  it('generates role-correct sessions and route-server templates', () => {
    expect(bgp).toContain('local.role=ebgp-customer remote.address=203.0.113.1');
    expect(bgp).toContain('local.role=ebgp-rs-client remote.address=196.60.70.1');
    expect(bgp).toContain('local.role=ebgp-peer remote.address=196.60.70.113');
  });

  it('sets a max-prefix guardrail on templates', () => {
    expect(bgp).toContain('input.limit-process-routes-ipv4=1500000');
    expect(bgp).toContain('input.limit-process-routes-ipv6=300000');
    expect(bgp).toContain('input.limit-process-routes-ipv4=250000');
  });

  it('omits the BGP accept rules when no BGP peers are configured', () => {
    const minimal = generatePackage(minimalConfig(), FIXED_META_DATE);
    const content = file(minimal.files, '10-firewall.rsc');
    expect(content).not.toContain('GEN-FW:input-bgp');
    expect(content).not.toContain('GEN-FW:v6-input-bgp');
    expect(content).not.toContain('GEN-FW:raw-bgp-input');
    expect(minimal.lint.filter((issue) => issue.level === 'warning')).toEqual([]);
  });

  it('does not generate an unused IPv6 chain for a v4-only custom peer', () => {
    expect(bgp).not.toContain('gen-peer-in-v6-local-peer');
  });

  it('cleans up prior generated objects', () => {
    expect(bgp).toContain('/routing/bgp/connection remove [find where name~"^gen-"]');
    expect(bgp).toContain('/routing/filter/rule remove [find where comment~"^GEN-BGP:"]');
  });
});
