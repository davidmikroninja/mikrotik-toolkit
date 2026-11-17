export function slug(input: string, maxLength = 32): string {
  const value = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (value || 'item').slice(0, maxLength).replace(/-+$/g, '') || 'item';
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim() !== ''))].sort((a, b) =>
    a.localeCompare(b, 'en'),
  );
}

export function csv(values: string[]): string {
  return values.join(',');
}

/** RouterOS double-quoted string literal. Escapes the special characters. */
export function rosString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\?/g, '\\?')
    .replace(/\r?\n/g, ' ');
  return `"${escaped}"`;
}

/** RouterOS identifier: leave simple names unquoted, quote anything else. */
export function rosName(value: string): string {
  return /^[A-Za-z0-9._-]+$/.test(value) ? value : rosString(value);
}

export function lines(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join('\n');
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b, 'en'),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}

/** Non-cryptographic, stable identifier for the input configuration. */
export function configId(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function parseInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
