/**
 * Fake game server. The only module that knows how a result is produced.
 * To connect the real API, replace `play` with a fetch to the backend that returns
 * the same `PlayResult`; nothing else in the app has to change.
 */
import { MAX_BET, MIN_BET } from '../core/bet';
import type { Cents } from '../core/money';
import { getTable, isRisk, isRows, type MultiplierTable, type Risk } from '../core/multipliers';
import { resolveRound } from '../core/round';
import {
  cryptoRandomBytes,
  randomId,
  randomInt,
  type Direction,
  type RandomBytes,
} from '../core/rng';

export interface PlayRequest {
  /** Stake in hundredths of RC. */
  bet: Cents;
  rows: number;
  risk: Risk;
}

export interface PlayResult {
  id: string;
  /** One entry per row: 0 = bounce left, 1 = bounce right. */
  path: Direction[];
  /** Landing bin, 0..rows. Always equals the number of 1s in `path`. */
  bin: number;
  multiplier: number;
  /** bet × multiplier rounded down, in hundredths of RC. */
  payout: Cents;
}

export type PlayFn = (request: PlayRequest) => Promise<PlayResult>;

export class PlayError extends Error {
  override name = 'PlayError';
}

export interface FakeServerOptions {
  randomBytes?: RandomBytes;
  getTable?: (rows: number, risk: Risk) => MultiplierTable;
  /** Simulated network latency range, ms. */
  latency?: readonly [min: number, max: number];
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createFakeServer({
  randomBytes = cryptoRandomBytes,
  getTable: tableFor = getTable,
  latency = [100, 300],
  sleep = defaultSleep,
}: FakeServerOptions = {}): PlayFn {
  return async ({ bet, rows, risk }) => {
    if (!Number.isSafeInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
      throw new PlayError(`Invalid bet: ${bet}`);
    }
    if (!isRows(rows)) throw new PlayError(`Invalid rows: ${rows}`);
    if (!isRisk(risk)) throw new PlayError(`Invalid risk: ${String(risk)}`);

    // Decide the outcome first, then "send it over the network".
    const outcome = resolveRound(bet, tableFor(rows, risk), randomBytes);
    const result: PlayResult = { id: randomId(randomBytes), ...outcome };
    await sleep(randomInt(latency[0], latency[1], randomBytes));
    return result;
  };
}

export const play: PlayFn = createFakeServer();
