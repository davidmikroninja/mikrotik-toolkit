import type { Config, IssueLevel } from './types';

export interface LintIssue {
  level: IssueLevel;
  line: number;
  message: string;
}

type LintContext = {
  config: Config;
  file: 'firewall' | 'bgp' | 'preflight' | 'finalize';
};

function stripStringsAndComments(line: string): string {
  let output = '';
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (character === '\\') {
        index += 1;
        continue;
      }
      if (character === quote) quote = null;
      continue;
    }
    if (character === '#') break;
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    output += character;
  }
  return output;
}

function stripComments(line: string): string {
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (character === '\\') {
        index += 1;
        continue;
      }
      if (character === quote) quote = null;
      continue;
    }
    if (character === '#') return line.slice(0, index);
    if (character === '"' || character === "'") quote = character;
  }
  return line;
}

function unquote(value: string): string {
  const trimmed = value.trim().replace(/;$/, '');
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\(["'\\])/g, '$1');
  }
  return trimmed;
}

function capture(text: string, pattern: RegExp, group = 1): string[] {
  const results: string[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match[group]) results.push(unquote(match[group]));
  }
  return results;
}

export function lintRouterOS(script: string, context?: LintContext): LintIssue[] {
  const issues: LintIssue[] = [];
  const lines = script.split('\n');
  const codeLines = lines.map((line) => stripComments(line));
  const structural = lines.map((line) => stripStringsAndComments(line));
  const allCode = codeLines.join('\n');

  // Brace balance, ignoring braces inside comments and quoted strings.
  let depth = 0;
  structural.forEach((line, index) => {
    for (const character of line) {
      if (character === '{') depth += 1;
      if (character === '}') {
        depth -= 1;
        if (depth < 0) {
          issues.push({
            level: 'error',
            line: index + 1,
            message: 'Unmatched closing brace.',
          });
          depth = 0;
        }
      }
    }
  });
  if (depth !== 0) {
    issues.push({
      level: 'error',
      line: lines.length,
      message: `Unbalanced braces at end of file (${depth} unclosed).`,
    });
  }

  // Version-sensitive or historically broken syntax.
  const checks: Array<[RegExp, string]> = [
    [/\baddress-families\s*=/, 'Use afi= instead of address-families= (RouterOS 7.20+).'],
    [/\btemplate\s*=(?!s)/, 'Use templates= (plural) on BGP connections.'],
    [/dst-len\s*>=\s*(32|128)/, 'Own-prefix rejection must match the whole prefix, not only host routes.'],
    [/\bssh-allowed-in\b/, 'ssh-allowed-in is not defined; this rule is dead.'],
    [/\bddns-enabled\s*=\s*no\b/, 'ddns-enabled=no is invalid on RouterOS 7.24; use ddns-enabled=auto.'],
    [
      /\/routing[ /]bgp[ /](?:template|connection)[ /]add[^\n]*router-id=/,
      'router-id is not a BGP template/connection property on RouterOS 7.20+; use /routing id.',
    ],

  ];
  checks.forEach(([pattern, message]) => {
    codeLines.forEach((line, index) => {
      if (pattern.test(line)) {
        issues.push({ level: 'error', line: index + 1, message });
      }
    });
  });

  // Collections of definitions and references.
  const definedChains = new Set(
    capture(allCode, /\/routing[ /]filter[ /]rule[ /]add chain=("[^"]+"|\S+)/g),
  );
  capture(allCode, /\/routing[ /]filter[ /]rule[ /]add [^\n]*chain=("[^"]+"|\S+)/g).forEach(
    (chain) => definedChains.add(chain),
  );

  const referencedChains = new Set([
    ...capture(allCode, /input\.filter=("[^"]+"|\S+)/g),
    ...capture(allCode, /output\.filter-chain=("[^"]+"|\S+)/g),
    ...capture(allCode, /jump ("[^"]+"|\S+);/g),
  ]);
  referencedChains.forEach((chain) => {
    if (!definedChains.has(chain)) {
      issues.push({
        level: 'error',
        line: 0,
        message: `Filter chain "${chain}" is referenced but never defined.`,
      });
    }
  });

  const definedAddressLists = new Set(
    capture(allCode, /address-list add [^\n]*?list=("[^"]+"|\S+)/g),
  );
  const referencedAddressLists = new Set([
    ...capture(allCode, /src-address-list=("[^"]+"|\S+)/g),
    ...capture(allCode, /dst-address-list=("[^"]+"|\S+)/g),
  ]);
  referencedAddressLists.forEach((list) => {
    if (!definedAddressLists.has(list) && !list.startsWith('!')) {
      issues.push({
        level: 'warning',
        line: 0,
        message: `Address list "${list}" is referenced but not created; the rule will never match.`,
      });
    }
  });

  const definedInterfaceLists = new Set(
    capture(allCode, /interface list add [^\n]*?name=("[^"]+"|\S+)/g),
  );
  const referencedInterfaceLists = new Set(
    capture(allCode, /in-interface-list=("[^"]+"|\S+)/g),
  );
  referencedInterfaceLists.forEach((list) => {
    const bare = list.replace(/^!/, '');
    if (!definedInterfaceLists.has(bare)) {
      issues.push({
        level: 'warning',
        line: 0,
        message: `Interface list "${list}" is referenced but not created.`,
      });
    }
  });

  const definedTemplates = capture(
    allCode,
    /\/routing[ /]bgp[ /]template[ /]add name=("[^"]+"|\S+)/g,
  );
  const templateSet = new Set(definedTemplates);
  const duplicateTemplates = definedTemplates.filter(
    (name, index) => definedTemplates.indexOf(name) !== index,
  );
  [...new Set(duplicateTemplates)].forEach((name) => {
    issues.push({ level: 'error', line: 0, message: `Duplicate BGP template name "${name}".` });
  });
  capture(allCode, /\btemplates=("[^"]+"|\S+)/g).forEach((value) => {
    value.split(',').forEach((template) => {
      const name = template.trim();
      if (name && !templateSet.has(name)) {
        issues.push({
          level: 'error',
          line: 0,
          message: `BGP connection references missing template "${name}".`,
        });
      }
    });
  });

  const connectionNames = capture(
    allCode,
    /\/routing[ /]bgp[ /]connection[ /]add name=("[^"]+"|\S+)/g,
  );
  const duplicateConnections = connectionNames.filter(
    (name, index) => connectionNames.indexOf(name) !== index,
  );
  [...new Set(duplicateConnections)].forEach((name) => {
    issues.push({ level: 'error', line: 0, message: `Duplicate BGP connection name "${name}".` });
  });

  // A v6 template must point at the v6 network list, and vice versa.
  codeLines.forEach((line, index) => {
    if (/afi=ipv6/.test(line) && /output\.network=bgp-networks-v4/.test(line)) {
      issues.push({
        level: 'error',
        line: index + 1,
        message: 'IPv6 template points at the IPv4 network list.',
      });
    }
    if (/afi=ip\b/.test(line) && /output\.network=bgp-networks-v6/.test(line)) {
      issues.push({
        level: 'error',
        line: index + 1,
        message: 'IPv4 template points at the IPv6 network list.',
      });
    }
  });

  if (context) {
    const { config, file } = context;
    if (file === 'bgp' && !/\/routing[ /]bgp[ /]instance[ /]add name=gen-/.test(allCode)) {
      issues.push({
        level: 'error',
        line: 0,
        message: 'No generated BGP instance; 7.20+ connections require instance=.',
      });
    }
    codeLines.forEach((line, index) => {
      if (
        /\/routing[ /]bgp[ /]connection[ /]add/.test(line) &&
        !/instance=/.test(line)
      ) {
        issues.push({
          level: 'error',
          line: index + 1,
          message: 'BGP connection is missing the mandatory instance= parameter.',
        });
      }
    });
    if (file === 'bgp' && config.rpki.enabled && config.rpki.groups.some((group) => group.enabled)) {
      if (config.peering.ct.routeServers || config.peering.jb.routeServers) {
        if (!/rpki-verify/.test(allCode)) {
          issues.push({
            level: 'warning',
            line: 0,
            message: 'RPKI is enabled but no input chain calls rpki-verify.',
          });
        }
      }
    }
    if (file === 'firewall') {
      if (
        config.addressFamilies.ipv6.enabled &&
        config.firewall.ipv6Mode !== 'off' &&
        !/\/ipv6 firewall (filter|raw)/.test(allCode)
      ) {
        issues.push({
          level: 'error',
          line: 0,
          message: 'IPv6 is enabled but no IPv6 firewall rules were generated.',
        });
      }
      if (config.firewall.mode === 'stateful' && !/connection tracking set enabled=auto/.test(allCode)) {
        issues.push({
          level: 'error',
          line: 0,
          message: 'Stateful mode did not enable connection tracking.',
        });
      }
      if (config.firewall.mode === 'stateless' && !/connection tracking set enabled=no/.test(allCode)) {
        issues.push({
          level: 'error',
          line: 0,
          message: 'Stateless mode did not disable connection tracking.',
        });
      }
      if (config.firewall.inputPolicy === 'drop' && !/GEN-FW:input-default-drop/.test(allCode)) {
        issues.push({
          level: 'error',
          line: 0,
          message: 'Input policy is drop but no default-drop rule was generated.',
        });
      }
    }
  }

  return issues;
}
