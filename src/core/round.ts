import { calcPayout, type Cents } from './money';
import type { MultiplierTable } from './multipliers';
import { randomPath, type Direction, type RandomBytes } from './rng';

export interface RoundOutcome {
  path: Direction[];
  bin: number;
  multiplier: number;
  payout: Cents;
}

/**
 * Pure, synchronous resolution of one ball: rows random left/right choices,
 * bin = number of "right"s, payout = bet × multiplier rounded down to 0.01.
 * Shared by the fake server and the dev-panel simulation.
 */
export function resolveRound(
  bet: Cents,
  table: MultiplierTable,
  randomBytes: RandomBytes,
): RoundOutcome {
  const rows = table.length - 1;
  const path = randomPath(rows, randomBytes);
  const bin = path.reduce<number>((sum, step) => sum + step, 0);
  const multiplier = table[bin];
  if (multiplier === undefined) throw new Error(`No multiplier for bin ${bin}`);
  return { path, bin, multiplier, payout: calcPayout(bet, multiplier) };
}

/**
 * Checks a server answer against the request before the game trusts it: the board
 * animates `path`, while the balance pays `payout`, so they must describe the same bin.
 * Returns what is wrong, or null for a consistent result.
 */
export function verifyRound(
  result: { id?: unknown; path?: unknown; bin?: unknown; multiplier?: unknown; payout?: unknown },
  bet: Cents,
  table: MultiplierTable,
): string | null {
  const rows = table.length - 1;
  if (typeof result.id !== 'string' || result.id === '') return 'missing id';
  const { path, bin, multiplier, payout } = result;
  if (!Array.isArray(path) || path.length !== rows) return `path must have ${rows} steps`;
  if (!path.every((step) => step === 0 || step === 1)) return 'path steps must be 0 or 1';
  const rights = path.reduce<number>((sum, step: number) => sum + step, 0);
  if (bin !== rights) return `bin ${String(bin)} does not match the path (${rights})`;
  const expected = table[rights];
  if (expected === undefined || multiplier !== expected) {
    return `multiplier ${String(multiplier)} is not the table's ${String(expected)}`;
  }
  if (payout !== calcPayout(bet, expected)) return `payout ${String(payout)} is wrong`;
  return null;
}
