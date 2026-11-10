import { describe, expect, it } from 'vitest';
import { calcPayout, formatCents, fromUnits, multiplierToHundredths, parseAmount } from './money';

describe('calcPayout', () => {
  it.each([
    // bet (cents), multiplier, payout (cents)
    [100, 1, 100],
    [100, 0.5, 50],
    [10, 0.3, 3], // 0.10 × 0.3 = 0.03
    [15, 0.5, 7], // 0.15 × 0.5 = 0.075 → 0.07 (rounded down)
    [33, 5.6, 184], // 0.33 × 5.6 = 1.848 → 1.84
    [99, 0.2, 19], // 0.99 × 0.2 = 0.198 → 0.19
    [100_000, 1000, 100_000_000], // 1 000 RC × 1000 = 1 000 000 RC
    [12_345, 8.1, 99_994], // 123.45 × 8.1 = 999.945 → 999.94
    [10, 1.1, 11],
    [70, 1.1, 77], // float 0.7 × 1.1 = 0.77000…01 must not leak
  ])('%i × %d = %i', (bet, multiplier, payout) => {
    expect(calcPayout(bet, multiplier)).toBe(payout);
  });

  it('never pays more than the exact product', () => {
    for (let bet = 10; bet <= 2_000; bet += 7) {
      for (const m of [0.2, 0.3, 0.7, 1.1, 1.3, 1.6, 2.1, 5.6, 8.1, 29, 1000]) {
        const payout = calcPayout(bet, m);
        const exact = (bet * Math.round(m * 100)) / 100;
        expect(Number.isInteger(payout)).toBe(true);
        expect(payout).toBeLessThanOrEqual(exact);
        expect(exact - payout).toBeLessThan(1);
      }
    }
  });

  it('rejects non-integer bets and bad multipliers', () => {
    expect(() => calcPayout(1.5, 2)).toThrow();
    expect(() => calcPayout(100, 1.234)).toThrow();
    expect(() => calcPayout(100, -1)).toThrow();
    expect(() => calcPayout(100, Number.NaN)).toThrow();
  });
});

describe('multiplierToHundredths', () => {
  it('handles float-unfriendly values exactly', () => {
    expect(multiplierToHundredths(0.3)).toBe(30);
    expect(multiplierToHundredths(1.1)).toBe(110);
    expect(multiplierToHundredths(8.1)).toBe(810);
    expect(multiplierToHundredths(1000)).toBe(100_000);
  });
});

describe('formatCents', () => {
  it('formats with two decimals and grouping', () => {
    expect(formatCents(100_000, { group: ' ' })).toBe('1 000.00');
    expect(formatCents(5, { group: ' ' })).toBe('0.05');
    expect(formatCents(123_456_789, { group: ',' })).toBe('1,234,567.89');
    expect(formatCents(-250, { group: ' ' })).toBe('-2.50');
  });
});

describe('parseAmount', () => {
  it.each([
    ['1', 100],
    ['1.5', 150],
    ['1,50', 150],
    ['.5', 50],
    ['0.1', 10],
    ['1 000', 100_000],
    ['  12.34 ', 1_234],
    ['10.', 1_000],
  ])('"%s" → %i', (input, cents) => {
    expect(parseAmount(input)).toBe(cents);
  });

  it.each(['', '.', 'abc', '1.234', '-1', '1e3', '1.2.3', '0x10', '1234567890'])(
    'rejects "%s"',
    (input) => {
      expect(parseAmount(input)).toBeNull();
    },
  );
});

describe('fromUnits', () => {
  it('converts RC constants to cents', () => {
    expect(fromUnits(1000)).toBe(100_000);
    expect(fromUnits(0.1)).toBe(10);
  });
});
