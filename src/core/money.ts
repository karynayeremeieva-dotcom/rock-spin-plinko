/**
 * Money is always an integer number of hundredths of RC ("cents").
 * 100_000 = 1 000.00 RC. No float amounts anywhere in the game.
 */
export type Cents = number;

export const CENTS_PER_UNIT = 100;

export function isCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** 1.5 → 150. Only for constants written in RC; never for computed amounts. */
export function fromUnits(units: number): Cents {
  const cents = Math.round(units * CENTS_PER_UNIT);
  if (!Number.isSafeInteger(cents)) throw new RangeError(`Bad amount: ${units}`);
  return cents;
}

/**
 * Multiplier as an integer number of hundredths: 5.6 → 560.
 * Config multipliers may have at most two decimals; anything finer is a config error.
 */
export function multiplierToHundredths(multiplier: number): number {
  const scaled = multiplier * 100;
  const hundredths = Math.round(scaled);
  if (!Number.isFinite(multiplier) || multiplier < 0 || Math.abs(scaled - hundredths) > 1e-6) {
    throw new RangeError(`Multiplier must be ≥ 0 with at most two decimals: ${multiplier}`);
  }
  return hundredths;
}

/** payout = bet × multiplier, rounded down to 0.01 RC. Pure integer arithmetic. */
export function calcPayout(bet: Cents, multiplier: number): Cents {
  if (!isCents(bet) || bet < 0) throw new RangeError(`Bet must be a non-negative integer: ${bet}`);
  const product = bet * multiplierToHundredths(multiplier);
  if (!Number.isSafeInteger(product)) throw new RangeError('Payout overflow');
  return (product - (product % 100)) / 100;
}

export interface FormatOptions {
  /** Thousands separator. */
  group?: string;
  /** Decimal separator. */
  decimal?: string;
}

/** 123456 → "1 234.56". Integer-based, so no float rounding surprises. */
export function formatCents(cents: Cents, { group = '\u00a0', decimal = '.' }: FormatOptions = {}) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / CENTS_PER_UNIT);
  const frac = abs % CENTS_PER_UNIT;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${sign}${grouped}${decimal}${String(frac).padStart(2, '0')}`;
}

const AMOUNT_RE = /^(\d{0,9})(?:[.,](\d{0,2}))?$/;

/**
 * Parses user input like "12", "12.5", "12,50", ".5", "1 000" into cents.
 * Returns null for anything that is not a plain non-negative amount with ≤ 2 decimals.
 */
export function parseAmount(input: string): Cents | null {
  const text = input.replace(/[\s\u00a0\u202f]/g, '');
  const match = AMOUNT_RE.exec(text);
  if (!match) return null;
  const whole = match[1] ?? '';
  const frac = match[2] ?? '';
  if (whole === '' && frac === '') return null;
  return Number(whole || '0') * CENTS_PER_UNIT + Number(frac.padEnd(2, '0'));
}
