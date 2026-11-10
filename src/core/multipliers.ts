import rawConfig from '../config/multipliers.json';
import { multiplierToHundredths } from './money';

export const RISKS = ['low', 'medium', 'high'] as const;
export type Risk = (typeof RISKS)[number];

export const MIN_ROWS = 8;
export const MAX_ROWS = 16;
export const ROW_OPTIONS = Array.from({ length: MAX_ROWS - MIN_ROWS + 1 }, (_, i) => MIN_ROWS + i);

export const RTP_MIN = 0.988;
export const RTP_MAX = 0.992;

export type MultiplierTable = readonly number[];
/** rows → risk → table. Keys are row counts as strings, as in JSON. */
export type MultiplierConfig = Readonly<Record<string, Readonly<Record<Risk, MultiplierTable>>>>;

export function isRisk(value: unknown): value is Risk {
  return typeof value === 'string' && (RISKS as readonly string[]).includes(value);
}

export function isRows(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_ROWS && (value as number) <= MAX_ROWS;
}

/** P(bin k) = C(rows, k) / 2^rows. Exact for rows ≤ 16 in double precision. */
export function binProbabilities(rows: number): number[] {
  const total = 2 ** rows;
  const out: number[] = [];
  let c = 1;
  for (let k = 0; k <= rows; k++) {
    out.push(c / total);
    c = (c * (rows - k)) / (k + 1);
  }
  return out;
}

/** Expected return per 1 RC staked: Σ P(k) · m(k). 0.99 = 99%. */
export function calcRtp(table: MultiplierTable): number {
  const p = binProbabilities(table.length - 1);
  return table.reduce((sum, m, k) => sum + (p[k] ?? 0) * m, 0);
}

export type TableIssue =
  | { kind: 'length'; expected: number; actual: number }
  | { kind: 'value'; index: number; value: number }
  | { kind: 'asymmetric'; index: number }
  | { kind: 'rtp'; rtp: number };

/** Everything the dev panel warns about. Empty array = table is good. */
export function validateTable(rows: number, table: MultiplierTable): TableIssue[] {
  const issues: TableIssue[] = [];
  if (table.length !== rows + 1) {
    issues.push({ kind: 'length', expected: rows + 1, actual: table.length });
    return issues;
  }
  table.forEach((value, index) => {
    try {
      multiplierToHundredths(value);
    } catch {
      issues.push({ kind: 'value', index, value });
    }
  });
  for (let k = 0; k < Math.floor(table.length / 2); k++) {
    if (table[k] !== table[table.length - 1 - k]) issues.push({ kind: 'asymmetric', index: k });
  }
  const rtp = calcRtp(table);
  if (rtp < RTP_MIN || rtp > RTP_MAX) issues.push({ kind: 'rtp', rtp });
  return issues;
}

/** Throws if the config is missing a table or a table is malformed (RTP is not enforced). */
export function assertConfig(config: unknown): asserts config is MultiplierConfig {
  if (typeof config !== 'object' || config === null) throw new Error('Config must be an object');
  const record = config as Record<string, unknown>;
  for (const rows of ROW_OPTIONS) {
    const byRisk = record[String(rows)];
    if (typeof byRisk !== 'object' || byRisk === null) throw new Error(`Missing rows=${rows}`);
    for (const risk of RISKS) {
      const table = (byRisk as Record<string, unknown>)[risk];
      if (!Array.isArray(table) || !table.every((v) => typeof v === 'number')) {
        throw new Error(`Missing table rows=${rows} risk=${risk}`);
      }
      const hard = validateTable(rows, table).filter((issue) => issue.kind !== 'rtp');
      if (hard.length > 0) throw new Error(`Bad table rows=${rows} risk=${risk}`);
    }
  }
}

assertConfig(rawConfig);
export const DEFAULT_CONFIG: MultiplierConfig = rawConfig;

/** Currently active tables. The dev panel can replace them at runtime. */
let activeConfig: MultiplierConfig = DEFAULT_CONFIG;

export function getConfig(): MultiplierConfig {
  return activeConfig;
}

export function setConfig(config: MultiplierConfig): void {
  assertConfig(config);
  activeConfig = config;
}

export function getTable(
  rows: number,
  risk: Risk,
  config: MultiplierConfig = activeConfig,
): MultiplierTable {
  const table = config[String(rows)]?.[risk];
  if (!table) throw new Error(`No table for rows=${rows} risk=${risk}`);
  return table;
}
