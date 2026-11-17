export type Family = 4 | 6;

export interface Prefix {
  family: Family;
  network: bigint;
  length: number;
  /** Inclusive first address. */
  first: bigint;
  /** Inclusive last address. */
  last: bigint;
  input: string;
}

export function parseIPv4(input: string): bigint | null {
  const parts = input.split('.');
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

export function parseIPv6(input: string): bigint | null {
  if (input.length === 0 || input.includes('%')) return null;
  let address = input.toLowerCase();

  // Convert a trailing embedded IPv4 address to two hextets.
  if (address.includes('.')) {
    const lastColon = address.lastIndexOf(':');
    if (lastColon < 0) return null;
    const v4 = parseIPv4(address.slice(lastColon + 1));
    if (v4 === null) return null;
    const high = ((v4 >> 8n) & 0xffffn).toString(16);
    const low = (v4 & 0xffffn).toString(16);
    address = `${address.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = address.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const explicit = [...head, ...tail];
  if (explicit.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;

  if (halves.length === 2) {
    // "::" must stand for at least one zero group.
    if (explicit.length > 7) return null;
  } else if (explicit.length !== 8) {
    return null;
  }

  const groups = [
    ...head,
    ...Array<string>(8 - explicit.length).fill('0'),
    ...tail,
  ];
  let value = 0n;
  for (const group of groups) {
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

export function parseAddress(input: string): { family: Family; value: bigint } | null {
  if (input.includes(':')) {
    const value = parseIPv6(input);
    return value === null ? null : { family: 6, value };
  }
  const value = parseIPv4(input);
  return value === null ? null : { family: 4, value };
}

export function parsePrefix(input: string): Prefix | null {
  const trimmed = input.trim();
  const slash = trimmed.indexOf('/');
  const addressPart = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const lengthPart = slash === -1 ? null : trimmed.slice(slash + 1);
  const address = parseAddress(addressPart);
  if (!address) return null;

  const maxLength = address.family === 4 ? 32 : 128;
  let length = maxLength;
  if (lengthPart !== null) {
    if (!/^\d{1,3}$/.test(lengthPart)) return null;
    length = Number(lengthPart);
    if (length > maxLength) return null;
  }

  const hostBits = BigInt(maxLength - length);
  const network = (address.value >> hostBits) << hostBits;
  const last = network + (1n << hostBits) - 1n;
  return {
    family: address.family,
    network,
    length,
    first: network,
    last,
    input: trimmed,
  };
}

export function isIP(input: string): boolean {
  return parseAddress(input.trim()) !== null;
}

export function isCIDR(input: string): boolean {
  return parsePrefix(input) !== null;
}

export function prefixLength(input: string): number | null {
  return parsePrefix(input)?.length ?? null;
}

export function formatIPv4(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => ((value >> shift) & 0xffn).toString()).join('.');
}

export function formatIPv6(value: bigint): string {
  const groups: number[] = [];
  for (let shift = 112n; shift >= 0n; shift -= 16n) {
    groups.push(Number((value >> shift) & 0xffffn));
  }

  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < groups.length; index += 1) {
    if (groups[index] !== 0) continue;
    let end = index;
    while (end < groups.length && groups[end] === 0) end += 1;
    if (end - index > bestLength) {
      bestStart = index;
      bestLength = end - index;
    }
    index = end;
  }

  if (bestLength < 2) {
    return groups.map((group) => group.toString(16)).join(':');
  }

  const before = groups
    .slice(0, bestStart)
    .map((group) => group.toString(16))
    .join(':');
  const after = groups
    .slice(bestStart + bestLength)
    .map((group) => group.toString(16))
    .join(':');
  return `${before}::${after}`;
}

export function formatPrefix(prefix: Prefix): string {
  const address =
    prefix.family === 4 ? formatIPv4(prefix.network) : formatIPv6(prefix.network);
  return `${address}/${prefix.length}`;
}

export function normalizePrefix(input: string): string | null {
  const prefix = parsePrefix(input);
  return prefix ? formatPrefix(prefix) : null;
}

export function prefixesOverlap(a: Prefix, b: Prefix): boolean {
  return a.family === b.family && a.first <= b.last && b.first <= a.last;
}

export function addressInPrefix(address: string, prefix: string): boolean {
  const parsedAddress = parseAddress(address);
  const parsedPrefix = parsePrefix(prefix);
  if (!parsedAddress || !parsedPrefix) return false;
  return (
    parsedAddress.family === parsedPrefix.family &&
    parsedAddress.value >= parsedPrefix.first &&
    parsedAddress.value <= parsedPrefix.last
  );
}

export function parseLengthRange(
  input: string,
  maxAllowed: number,
): { min: number; max: number } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,3})(?:\s*-\s*(\d{1,3}))?$/.exec(trimmed);
  if (!match) return null;
  const min = Number(match[1]);
  const max = match[2] === undefined ? min : Number(match[2]);
  if (min > maxAllowed || max > maxAllowed || min > max) return null;
  return { min, max };
}

export function isHostname(input: string): boolean {
  const value = input.trim();
  if (value.length === 0 || value.length > 253) return false;
  if (value.endsWith('.')) return false;
  return value.split('.').every((label) => {
    return (
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)
    );
  });
}

export function isIpOrHostname(input: string): boolean {
  return isIP(input) || isHostname(input);
}
