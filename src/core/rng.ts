/** Source of random bytes. Injected so tests can be deterministic. */
export type RandomBytes = (length: number) => Uint8Array;

export const cryptoRandomBytes: RandomBytes = (length) =>
  crypto.getRandomValues(new Uint8Array(length));

export type Direction = 0 | 1;

/**
 * `rows` independent fair left (0) / right (1) choices.
 * Uses the lowest bit of each byte: 256 is even, so every bit is exactly 50/50.
 */
export function randomPath(rows: number, randomBytes: RandomBytes): Direction[] {
  const bytes = randomBytes(rows);
  if (bytes.length < rows) throw new Error('Random source returned too few bytes');
  return Array.from(bytes.subarray(0, rows), (byte) => (byte & 1) as Direction);
}

/** Uniform integer in [min, max]. Used for cosmetic things like the fake network delay. */
export function randomInt(min: number, max: number, randomBytes: RandomBytes): number {
  const bytes = randomBytes(4);
  const value = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
  return min + (value % (max - min + 1));
}

export function randomId(randomBytes: RandomBytes): string {
  return Array.from(randomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}
