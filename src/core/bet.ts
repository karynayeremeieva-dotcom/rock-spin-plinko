import type { Cents } from './money';

export const MIN_BET: Cents = 10; // 0.10 RC
export const MAX_BET: Cents = 100_000; // 1 000.00 RC
export const QUICK_BETS: readonly Cents[] = [100, 500, 1_000, 5_000];

export type BetError = 'invalid' | 'below_min' | 'above_max' | 'insufficient';

/** Why this bet can't be placed right now, or null if it can. */
export function validateBet(bet: Cents | null, balance: Cents): BetError | null {
  if (bet === null || !Number.isSafeInteger(bet) || bet < 0) return 'invalid';
  if (bet < MIN_BET) return 'below_min';
  if (bet > MAX_BET) return 'above_max';
  if (bet > balance) return 'insufficient';
  return null;
}

export function clampBet(bet: Cents): Cents {
  return Math.min(MAX_BET, Math.max(MIN_BET, bet));
}

/** Largest bet the player can afford, but never below the table minimum. */
export function maxBet(balance: Cents): Cents {
  return clampBet(balance);
}

export function halfBet(bet: Cents): Cents {
  return clampBet(Math.floor(bet / 2));
}

/** Doubles the bet, capped by the table maximum and by what the player can afford. */
export function doubleBet(bet: Cents, balance: Cents): Cents {
  return clampBet(Math.min(bet * 2, Math.max(balance, bet)));
}
