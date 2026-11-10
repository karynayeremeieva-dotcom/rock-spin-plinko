import { describe, expect, it } from 'vitest';
import { getTable } from './multipliers';
import { pooledRandomBytes, type RandomBytes } from './rng';
import { simulate } from './simulate';

describe('simulate', () => {
  it('reports totals that add up', async () => {
    const table = getTable(8, 'low');
    const progress: number[] = [];
    const r = await simulate(table, {
      rounds: 20_000,
      chunk: 5_000,
      onProgress: (d) => progress.push(d),
    });
    expect(progress).toEqual([5_000, 10_000, 15_000, 20_000]);
    expect(r.hits.reduce((a, b) => a + b, 0)).toBe(20_000);
    expect(r.wagered).toBe(20_000 * 100);
    expect(r.rtp).toBeCloseTo(r.paid / r.wagered, 12);
  });

  it('100 000 rounds land within 1.5% of the theoretical RTP (low risk)', async () => {
    const table = getTable(16, 'low');
    const r = await simulate(table);
    expect(Math.abs(r.rtp - r.expectedRtp)).toBeLessThan(0.015);
  });

  it('pays exactly the table when every ball goes to one bin', async () => {
    const allLeft: RandomBytes = (n) => new Uint8Array(n); // every bit 0 → bin 0
    const table = getTable(12, 'high');
    const r = await simulate(table, { rounds: 1_000, randomBytes: allLeft });
    expect(r.hits[0]).toBe(1_000);
    expect(r.paid).toBe(1_000 * 100 * (table[0] ?? 0));
  });

  it('can be aborted', async () => {
    const controller = new AbortController();
    const run = simulate(getTable(8, 'low'), {
      rounds: 100_000,
      chunk: 1_000,
      signal: controller.signal,
      onProgress: (done) => done >= 3_000 && controller.abort(),
    });
    await expect(run).rejects.toThrow('aborted');
  });

  it('pooled bytes are a slice of the source stream', () => {
    let counter = 0;
    const source: RandomBytes = (n) => Uint8Array.from({ length: n }, () => counter++ & 0xff);
    const pooled = pooledRandomBytes(source, 8);
    expect([...pooled(3), ...pooled(3), ...pooled(3)]).toEqual([0, 1, 2, 3, 4, 5, 8, 9, 10]);
  });
});
