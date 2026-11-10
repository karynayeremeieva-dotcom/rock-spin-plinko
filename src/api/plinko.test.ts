import { describe, expect, it } from 'vitest';
import { calcPayout } from '../core/money';
import { calcRtp, getTable, RISKS, ROW_OPTIONS } from '../core/multipliers';
import { resolveRound } from '../core/round';
import { cryptoRandomBytes, type RandomBytes } from '../core/rng';
import { createFakeServer, PlayError } from './plinko';

/** Deterministic byte source for reproducible tests (mulberry32). */
function seededBytes(seed: number): RandomBytes {
  let state = seed >>> 0;
  return (length) => {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      out[i] = ((t ^ (t >>> 14)) >>> 0) & 0xff;
    }
    return out;
  };
}

const instant = () => Promise.resolve();

describe('play (fake server)', () => {
  it('returns a consistent result for every rows/risk combination', async () => {
    const play = createFakeServer({ sleep: instant, randomBytes: seededBytes(1) });
    for (const rows of ROW_OPTIONS) {
      for (const risk of RISKS) {
        for (let i = 0; i < 50; i++) {
          const bet = 10 + i * 37;
          const r = await play({ bet, rows, risk });
          expect(r.path).toHaveLength(rows);
          expect(r.path.every((d) => d === 0 || d === 1)).toBe(true);
          expect(r.bin).toBe(r.path.filter((d) => d === 1).length);
          expect(r.multiplier).toBe(getTable(rows, risk)[r.bin]);
          expect(r.payout).toBe(calcPayout(bet, r.multiplier));
          expect(r.id).toMatch(/^[0-9a-f]{32}$/);
        }
      }
    }
  });

  it('bin always equals the number of right bounces (500 balls at 8 and 16 rows)', async () => {
    const play = createFakeServer({ sleep: instant });
    for (const rows of [8, 16]) {
      for (let i = 0; i < 500; i++) {
        const r = await play({ bet: 100, rows, risk: 'high' });
        expect(r.bin).toBe(r.path.reduce<number>((a, b) => a + b, 0));
      }
    }
  });

  it('waits 100–300 ms like a network call', async () => {
    const delays: number[] = [];
    const play = createFakeServer({
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    for (let i = 0; i < 200; i++) await play({ bet: 100, rows: 8, risk: 'low' });
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(100);
    expect(Math.max(...delays)).toBeLessThanOrEqual(300);
  });

  it.each([
    [{ bet: 9, rows: 8, risk: 'low' }],
    [{ bet: 100_001, rows: 8, risk: 'low' }],
    [{ bet: 10.5, rows: 8, risk: 'low' }],
    [{ bet: 100, rows: 7, risk: 'low' }],
    [{ bet: 100, rows: 17, risk: 'low' }],
    [{ bet: 100, rows: 8.5, risk: 'low' }],
    [{ bet: 100, rows: 8, risk: 'extreme' }],
  ])('rejects invalid request %o', async (request) => {
    const play = createFakeServer({ sleep: instant });
    // @ts-expect-error -- deliberately invalid risk in one case
    await expect(play(request)).rejects.toBeInstanceOf(PlayError);
  });
});

describe('fairness', () => {
  it('real RNG lands bins with binomial frequencies', () => {
    const rows = 8;
    const n = 100_000;
    const counts = new Array<number>(rows + 1).fill(0);
    const table = getTable(rows, 'low');
    for (let i = 0; i < n; i++) {
      const { bin } = resolveRound(100, table, cryptoRandomBytes);
      counts[bin] = (counts[bin] ?? 0) + 1;
    }
    // Chi-square with 8 degrees of freedom; 26.1 is the 0.1% critical value.
    const expected = [1, 8, 28, 56, 70, 56, 28, 8, 1].map((c) => (c / 256) * n);
    const chi2 = counts.reduce(
      (s, c, k) => s + (c - (expected[k] ?? 0)) ** 2 / (expected[k] ?? 1),
      0,
    );
    expect(chi2).toBeLessThan(26.1);
  });

  it('simulated RTP matches the table RTP', () => {
    const table = getTable(12, 'low');
    const n = 200_000;
    const bet = 100;
    let paid = 0;
    for (let i = 0; i < n; i++) paid += resolveRound(bet, table, cryptoRandomBytes).payout;
    // Low-risk 12 rows: per-ball std ≈ 0.6, so 200k balls give σ ≈ 0.0013 on RTP.
    expect(Math.abs(paid / (n * bet) - calcRtp(table))).toBeLessThan(0.01);
  });
});
