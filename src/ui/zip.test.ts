import { describe, expect, it } from 'vitest';
import { createZip } from './zip';

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

describe('store-only zip writer', () => {
  it('writes a valid local header, CRC and end-of-central-directory', async () => {
    const blob = createZip(
      [{ name: 'hello.txt', content: 'hello' }],
      new Date('2026-11-17T00:00:00Z'),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(readU32(bytes, 0)).toBe(0x04034b50);
    expect(readU32(bytes, 14)).toBe(0x3610a686); // crc32("hello")
    expect(readU32(bytes, 18)).toBe(5);
    const name = new TextDecoder().decode(bytes.slice(30, 39));
    expect(name).toBe('hello.txt');
    const end = bytes.length - 22;
    expect(readU32(bytes, end)).toBe(0x06054b50);
    expect(bytes[end + 10] | (bytes[end + 11] << 8)).toBe(1);
  });

  it('stores multiple entries and reports the count', async () => {
    const blob = createZip([
      { name: 'a.rsc', content: 'one' },
      { name: 'b.rsc', content: 'two' },
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const end = bytes.length - 22;
    expect(bytes[end + 8] | (bytes[end + 9] << 8)).toBe(2);
    expect(bytes[end + 10] | (bytes[end + 11] << 8)).toBe(2);
  });
});
