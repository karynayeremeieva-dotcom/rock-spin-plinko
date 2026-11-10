/**
 * Runs many rounds through the same code the fake server uses (resolveRound),
 * without animation. Used by the ?dev=1 panel to check that the generator and the
 * payouts really give the table's RTP.
 */
import { binProbabilities, calcRtp, type MultiplierTable } from './multipliers';
import type { Cents } from './money';
import { pooledRandomBytes, type RandomBytes } from './rng';
import { resolveRound } from './round';

export interface SimulationResult {
  rounds: number;
  wagered: Cents;
  paid: Cents;
  /** paid / wagered. */
  rtp: number;
  /** Theoretical RTP of the table. */
  expectedRtp: number;
  /** Landings per bin. */
  hits: number[];
  /** Expected landings per bin for this many rounds. */
  expectedHits: number[];
}

export interface SimulationOptions {
  rounds?: number;
  bet?: Cents;
  randomBytes?: RandomBytes;
  /** Rounds per slice; the loop yields to the browser between slices. */
  chunk?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function simulate(
  table: MultiplierTable,
  {
    rounds = 100_000,
    bet = 100,
    randomBytes = pooledRandomBytes(),
    chunk = 10_000,
    onProgress,
    signal,
  }: SimulationOptions = {},
): Promise<SimulationResult> {
  const hits = new Array<number>(table.length).fill(0);
  let paid = 0;
  for (let done = 0; done < rounds;) {
    if (signal?.aborted) throw new DOMException('Simulation aborted', 'AbortError');
    const end = Math.min(rounds, done + chunk);
    for (; done < end; done++) {
      const { bin, payout } = resolveRound(bet, table, randomBytes);
      hits[bin] = (hits[bin] ?? 0) + 1;
      paid += payout;
    }
    onProgress?.(done, rounds);
    if (done < rounds) await yieldToBrowser();
  }
  const wagered = bet * rounds;
  return {
    rounds,
    wagered,
    paid,
    rtp: paid / wagered,
    expectedRtp: calcRtp(table),
    hits,
    expectedHits: binProbabilities(table.length - 1).map((p) => p * rounds),
  };
}
