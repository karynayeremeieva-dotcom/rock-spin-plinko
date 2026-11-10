import { describe, expect, it } from 'vitest';
import { binProbabilities } from '../core/multipliers';
import { formatPercent } from './format';

describe('formatPercent', () => {
  it('keeps three significant digits for tiny and large chances', () => {
    expect(formatPercent(70 / 256)).toBe('27.3%');
    expect(formatPercent(binProbabilities(16)[0] ?? 0)).toBe('0.00153%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(1)).toBe('100%');
  });
});
