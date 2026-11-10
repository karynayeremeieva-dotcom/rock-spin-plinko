import { describe, expect, it } from 'vitest';
import committedJson from '../config/multipliers.json?raw';
import {
  binProbabilities,
  formatConfig,
  calcRtp,
  DEFAULT_CONFIG,
  getTable,
  RISKS,
  ROW_OPTIONS,
  RTP_MAX,
  RTP_MIN,
  validateTable,
} from './multipliers';

const TASK_TABLES = {
  '8 low': '5.6 2.1 1.1 1 0.5 1 1.1 2.1 5.6',
  '8 medium': '13 3 1.3 0.7 0.4 0.7 1.3 3 13',
  '8 high': '29 4 1.5 0.3 0.2 0.3 1.5 4 29',
  '12 low': '10 3 1.6 1.4 1.1 1 0.5 1 1.1 1.4 1.6 3 10',
  '12 medium': '33 11 4 2 1.1 0.6 0.3 0.6 1.1 2 4 11 33',
  '12 high': '170 24 8.1 2 0.7 0.2 0.2 0.2 0.7 2 8.1 24 170',
  '16 low': '16 9 2 1.4 1.4 1.2 1.1 1 0.5 1 1.1 1.2 1.4 1.4 2 9 16',
  '16 medium': '110 41 10 5 3 1.5 1 0.5 0.3 0.5 1 1.5 3 5 10 41 110',
  '16 high': '1000 130 26 9 4 2 0.2 0.2 0.2 0.2 0.2 2 4 9 26 130 1000',
} as const;

describe('binProbabilities', () => {
  it.each(ROW_OPTIONS)('sums to 1 for %i rows', (rows) => {
    const p = binProbabilities(rows);
    expect(p).toHaveLength(rows + 1);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('matches C(N,k)/2^N', () => {
    expect(binProbabilities(8)).toEqual([1, 8, 28, 56, 70, 56, 28, 8, 1].map((c) => c / 256));
  });
});

describe('multiplier config', () => {
  it('has all 27 tables', () => {
    expect(ROW_OPTIONS).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
    let count = 0;
    for (const rows of ROW_OPTIONS) {
      for (const risk of RISKS) {
        expect(getTable(rows, risk, DEFAULT_CONFIG)).toHaveLength(rows + 1);
        count++;
      }
    }
    expect(count).toBe(27);
  });

  describe.each(ROW_OPTIONS)('%i rows', (rows) => {
    it.each(RISKS)('%s: symmetric, valid and RTP within 98.8–99.2%%', (risk) => {
      const table = getTable(rows, risk, DEFAULT_CONFIG);
      expect(validateTable(rows, table)).toEqual([]);
      const rtp = calcRtp(table);
      expect(rtp).toBeGreaterThanOrEqual(RTP_MIN);
      expect(rtp).toBeLessThanOrEqual(RTP_MAX);
    });

    it.each(RISKS)('%s: grows from the centre to the edges', (risk) => {
      const table = getTable(rows, risk, DEFAULT_CONFIG);
      for (let k = 0; k < Math.floor(rows / 2); k++) {
        expect(table[k]).toBeGreaterThanOrEqual(table[k + 1] ?? Infinity);
      }
    });
  });

  it('keeps the task tables verbatim', () => {
    for (const [key, values] of Object.entries(TASK_TABLES)) {
      const [rows, risk] = key.split(' ') as [string, (typeof RISKS)[number]];
      expect(getTable(Number(rows), risk, DEFAULT_CONFIG).join(' ')).toBe(values);
    }
  });

  it('higher risk means a bigger top multiplier', () => {
    for (const rows of ROW_OPTIONS) {
      const [low, medium, high] = RISKS.map((r) => getTable(rows, r, DEFAULT_CONFIG)[0] ?? 0);
      expect(low).toBeLessThan(medium ?? 0);
      expect(medium).toBeLessThan(high ?? 0);
    }
  });
});

describe('validateTable', () => {
  it('reports length, asymmetry, precision and RTP problems', () => {
    expect(validateTable(8, [1, 1, 1])).toEqual([{ kind: 'length', expected: 9, actual: 3 }]);

    const kinds = validateTable(8, [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 9.99]).map((i) => i.kind);
    expect(kinds).toContain('asymmetric');

    const precise = validateTable(8, [5.6, 2.1, 1.1, 1, 0.555, 1, 1.1, 2.1, 5.6]);
    expect(precise).toContainEqual({ kind: 'value', index: 4, value: 0.555 });

    const generous = validateTable(8, [10, 10, 10, 10, 10, 10, 10, 10, 10]);
    expect(generous).toEqual([{ kind: 'rtp', rtp: 10 }]);
  });
});

describe('formatConfig', () => {
  it('reproduces the committed JSON byte for byte', () => {
    expect(formatConfig(DEFAULT_CONFIG)).toBe(committedJson);
    expect(JSON.parse(formatConfig(DEFAULT_CONFIG))).toEqual(DEFAULT_CONFIG);
  });
});
