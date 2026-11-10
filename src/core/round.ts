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
