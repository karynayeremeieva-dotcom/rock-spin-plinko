#!/usr/bin/env node
/**
 * Builds src/config/multipliers.json: 27 Plinko tables (rows 8–16 × low/medium/high).
 *
 * Rows 8, 12 and 16 are copied verbatim from the task. Rows 9–11 and 13–15 are derived:
 *
 * 1. Shape. Every anchor table is turned into a curve "log(multiplier) vs distance from the
 *    centre" (0 = centre bin, 1 = edge bin). For N rows we blend the curves of the two
 *    neighbouring anchors (8 & 12 or 12 & 16) with weight t = (N - lo) / (hi - lo).
 *    Blending in log space keeps the curve monotone and the edge growth geometric.
 * 2. Scale. The raw shape is multiplied by one factor so its RTP equals 99%.
 * 3. Round. Values snap to a "price ladder" players expect: 0.1 steps below 10×,
 *    whole numbers below 100×, tens above. Minimum 0.2×.
 * 4. Tune. Rounding moves RTP, so a greedy pass nudges one symmetric pair of bins by one
 *    ladder step at a time (keeping the table monotone) until RTP is within 99.0% ± 0.05%.
 *
 * RTP = Σ P(k) · m(k), where P(k) = C(N, k) / 2^N.
 *
 * Usage: node scripts/generate-multipliers.mjs [--check]
 *   --check  exit with code 1 if the committed JSON differs from what the script produces.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/config/multipliers.json');

const RISKS = ['low', 'medium', 'high'];
const ROWS = [8, 9, 10, 11, 12, 13, 14, 15, 16];
const TARGET = 0.99;
const TUNE_TOLERANCE = 0.0005;
const RTP_MIN = 0.988;
const RTP_MAX = 0.992;
const MIN_MULTIPLIER = 0.2;

/** Tables given in the task (section 4). Left half + centre; mirrored below. */
const ANCHORS = {
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5],
    medium: [13, 3, 1.3, 0.7, 0.4],
    high: [29, 4, 1.5, 0.3, 0.2],
  },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2],
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2],
  },
};

const mirror = (half) => [...half, ...half.slice(0, -1).reverse()];

function probabilities(rows) {
  const total = 2 ** rows;
  const out = [];
  let c = 1;
  for (let k = 0; k <= rows; k++) {
    out.push(c / total);
    c = (c * (rows - k)) / (k + 1);
  }
  return out;
}

const rtp = (table) => {
  const p = probabilities(table.length - 1);
  return table.reduce((sum, m, k) => sum + p[k] * m, 0);
};

/** Distance of bin k from the centre, 0..1. */
const distance = (k, rows) => Math.abs(k - rows / 2) / (rows / 2);

/** Piecewise-linear curve of ln(multiplier) over distance, built from an anchor table. */
function logCurve(table) {
  const rows = table.length - 1;
  const points = [];
  for (let k = Math.ceil(rows / 2); k <= rows; k++) {
    points.push([distance(k, rows), Math.log(table[k])]);
  }
  return (x) => {
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
    return points[points.length - 1][1];
  };
}

/** Ladder step for a value: what "one notch up" means at this size. */
function step(value) {
  if (value < 10) return 0.1;
  if (value < 100) return 1;
  return 10;
}

const fix = (v) => Math.round(v * 10) / 10;

function snap(value) {
  const s = step(value);
  return Math.max(MIN_MULTIPLIER, fix(Math.round(value / s) * s));
}

function up(value) {
  return fix(value + step(value));
}

function down(value) {
  // Step size below the current value (e.g. 10 → 9.9, 100 → 99).
  const s = step(value - 1e-9);
  return fix(value - s);
}

/** Table is non-decreasing from the centre to each edge. */
function isMonotone(table) {
  const rows = table.length - 1;
  for (let k = 0; k < Math.floor(rows / 2); k++) {
    if (table[k] < table[k + 1]) return false;
  }
  return true;
}

function withPair(table, k, value) {
  const next = table.slice();
  next[k] = value;
  next[table.length - 1 - k] = value;
  return next;
}

/** All tables reachable by moving one symmetric pair of bins one ladder step up or down. */
function neighbours(table) {
  const out = [];
  for (let k = 0; k <= Math.floor((table.length - 1) / 2); k++) {
    for (const value of [up(table[k]), down(table[k])]) {
      if (value < MIN_MULTIPLIER) continue;
      const candidate = withPair(table, k, value);
      if (isMonotone(candidate)) out.push(candidate);
    }
  }
  return out;
}

/**
 * Greedy RTP tuning. Each round tries every single move and every combination of two
 * moves (one step on one pair, one step on another): with coarse ladder steps on the
 * high-probability bins a single move can overshoot, while two opposite moves can land
 * in between.
 */
function tune(table) {
  let current = table;
  for (let i = 0; i < 200; i++) {
    let bestError = Math.abs(rtp(current) - TARGET);
    if (bestError <= TUNE_TOLERANCE) return current;
    let best = null;
    for (const first of neighbours(current)) {
      for (const candidate of [first, ...neighbours(first)]) {
        const candidateError = Math.abs(rtp(candidate) - TARGET);
        if (candidateError < bestError - 1e-12) {
          best = candidate;
          bestError = candidateError;
        }
      }
    }
    if (!best) return current;
    current = best;
  }
  return current;
}

function derive(rows, risk) {
  const lo = rows < 12 ? 8 : 12;
  const hi = lo + 4;
  const t = (rows - lo) / (hi - lo);
  const curveLo = logCurve(mirror(ANCHORS[lo][risk]));
  const curveHi = logCurve(mirror(ANCHORS[hi][risk]));

  const shape = [];
  for (let k = 0; k <= rows; k++) {
    const x = distance(k, rows);
    shape.push(Math.exp((1 - t) * curveLo(x) + t * curveHi(x)));
  }
  const scale = TARGET / rtp(shape);
  return tune(shape.map((m) => snap(m * scale)));
}

function build() {
  const config = {};
  for (const rows of ROWS) {
    config[rows] = {};
    for (const risk of RISKS) {
      const table = ANCHORS[rows] ? mirror(ANCHORS[rows][risk]) : derive(rows, risk);
      const value = rtp(table);
      if (value < RTP_MIN || value > RTP_MAX) {
        throw new Error(`rows=${rows} risk=${risk}: RTP ${(value * 100).toFixed(3)}% out of range`);
      }
      if (!isMonotone(table)) throw new Error(`rows=${rows} risk=${risk}: not monotone`);
      config[rows][risk] = table;
    }
  }
  return config;
}

function format(config) {
  // One table per line keeps the file readable and diffs small.
  const lines = ['{'];
  ROWS.forEach((rows, i) => {
    lines.push(`  "${rows}": {`);
    RISKS.forEach((risk, j) => {
      const comma = j < RISKS.length - 1 ? ',' : '';
      lines.push(`    "${risk}": [${config[rows][risk].join(', ')}]${comma}`);
    });
    lines.push(`  }${i < ROWS.length - 1 ? ',' : ''}`);
  });
  lines.push('}', '');
  return lines.join('\n');
}

const config = build();
const json = format(config);

for (const rows of ROWS) {
  for (const risk of RISKS) {
    const table = config[rows][risk];
    const mark = ANCHORS[rows] ? 'task   ' : 'derived';
    console.log(
      `${String(rows).padStart(2)} ${risk.padEnd(6)} ${mark} RTP ${(rtp(table) * 100).toFixed(3)}%  ${table.join(' ')}`,
    );
  }
}

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    // missing file counts as a mismatch
  }
  if (current !== json) {
    console.error('\nmultipliers.json is out of date. Run: npm run gen:multipliers');
    process.exit(1);
  }
  console.log('\nmultipliers.json is up to date.');
} else {
  writeFileSync(OUT, json);
  console.log(`\nWritten ${OUT}`);
}
