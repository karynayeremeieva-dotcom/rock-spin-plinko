import { describe, expect, it } from 'vitest';
import { doubleBet, halfBet, MAX_BET, maxBet, MIN_BET, validateBet } from './bet';

describe('validateBet', () => {
  it.each([
    [null, 100_000, 'invalid'],
    [1.5, 100_000, 'invalid'],
    [-10, 100_000, 'invalid'],
    [9, 100_000, 'below_min'],
    [100_001, 1_000_000, 'above_max'],
    [5_001, 5_000, 'insufficient'],
    [10, 100_000, null],
    [100_000, 100_000, null],
    [5_000, 5_000, null],
  ] as const)('bet %s with balance %i → %s', (bet, balance, expected) => {
    expect(validateBet(bet, balance)).toBe(expected);
  });
});

describe('bet buttons', () => {
  it('½ halves and never goes below the minimum', () => {
    expect(halfBet(1_000)).toBe(500);
    expect(halfBet(15)).toBe(MIN_BET);
    expect(halfBet(MIN_BET)).toBe(MIN_BET);
  });

  it('×2 doubles, capped by balance and table maximum', () => {
    expect(doubleBet(1_000, 100_000)).toBe(2_000);
    expect(doubleBet(1_000, 1_500)).toBe(1_500);
    expect(doubleBet(80_000, 1_000_000)).toBe(MAX_BET);
    // Balance below the current bet: ×2 does not make it worse.
    expect(doubleBet(1_000, 500)).toBe(1_000);
  });

  it('Max is the balance within table limits', () => {
    expect(maxBet(12_345)).toBe(12_345);
    expect(maxBet(5_000_000)).toBe(MAX_BET);
    expect(maxBet(3)).toBe(MIN_BET);
  });
});
