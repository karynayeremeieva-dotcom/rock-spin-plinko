import { describe, expect, it } from 'vitest';
import { createFakeServer } from '../api/plinko';
import { ROW_OPTIONS } from '../core/multipliers';
import type { Direction } from '../core/rng';
import { CABINET_LAYOUT } from './cabinet';
import {
  binAt,
  binCenterX,
  computeCabinetGeometry,
  computeGeometry,
  pegCount,
  pegX,
  pegY,
} from './geometry';
import { buildTrajectory } from './trajectory';

const sizes = [
  [360, 360],
  [390, 480],
  [800, 600],
] as const;

describe('geometry', () => {
  it.each(ROW_OPTIONS)('fits %i rows inside the board', (rows) => {
    for (const [w, h] of sizes) {
      const g = computeGeometry(w, h, rows);
      const last = rows - 1;
      expect(pegX(g, last, 0)).toBeGreaterThan(0);
      expect(pegX(g, last, pegCount(last) - 1)).toBeLessThan(w);
      expect(g.spawnY).toBeGreaterThanOrEqual(0);
      expect(g.binTop + g.binHeight).toBeLessThanOrEqual(h + 1e-9);
      // Ball must fit between two neighbouring pegs.
      expect(g.ballRadius * 2).toBeLessThan(g.spacing - 2 * g.pegRadius);
    }
  });

  it('uses spare height on a tall, narrow board without breaking the pyramid', () => {
    const g = computeGeometry(370, 500, 16);
    expect(g.binHeight).toBeGreaterThan(g.spacing * 0.95);
    expect(g.rowGap).toBeLessThanOrEqual(g.spacing * 1.0 + 1e-9);
    expect(g.binTop + g.binHeight).toBeLessThanOrEqual(500 + 1e-9);
    const wide = computeGeometry(900, 500, 8);
    expect(wide.rowGap).toBeCloseTo(wide.spacing * 0.92, 9);
  });

  it('bins sit between the pegs of the last row', () => {
    const g = computeGeometry(390, 480, 12);
    for (let k = 0; k <= 12; k++) {
      expect(binCenterX(g, k)).toBeCloseTo((pegX(g, 11, k) + pegX(g, 11, k + 1)) / 2, 9);
    }
  });

  it('binAt finds the bin under a point', () => {
    const g = computeGeometry(390, 480, 8);
    const y = g.binTop + g.binHeight / 2;
    for (let k = 0; k <= 8; k++) expect(binAt(g, binCenterX(g, k), y)).toBe(k);
    expect(binAt(g, binCenterX(g, 0), g.binTop - 5)).toBe(-1);
    expect(binAt(g, -10, y)).toBe(-1);
  });
});

describe('trajectory', () => {
  it('lands in the bin from play() — 500 balls at 8 and 16 rows', async () => {
    const play = createFakeServer({ sleep: () => Promise.resolve() });
    for (const rows of [8, 16]) {
      const g = computeGeometry(390, 480, rows);
      const y = g.binTop + g.binHeight / 2;
      for (let i = 0; i < 500; i++) {
        const result = await play({ bet: 100, rows, risk: 'medium' });
        const tr = buildTrajectory(g, result.path);
        const end = tr.position(tr.duration);
        expect(tr.bin).toBe(result.bin);
        expect(binAt(g, end.x, y)).toBe(result.bin);
        expect(end.y).toBeGreaterThanOrEqual(g.binTop);
      }
    }
  });

  it('touches the right peg on every row', () => {
    const g = computeGeometry(390, 480, 8);
    const path: Direction[] = [1, 1, 0, 1, 0, 0, 1, 1];
    const tr = buildTrajectory(g, path, { random: () => 0.5 });
    expect(tr.pegs).toEqual([1, 2, 3, 3, 4, 4, 4, 5]);
    expect(tr.hits).toHaveLength(8);
    tr.hits.forEach((t, row) => {
      const p = tr.position(t);
      const peg = tr.pegs[row] ?? -1;
      expect(Math.abs(p.x - pegX(g, row, peg))).toBeLessThan(g.spacing / 2);
      expect(p.y).toBeLessThan(pegY(g, row));
      expect(pegY(g, row) - p.y).toBeLessThan(g.pegRadius + g.ballRadius * 1.5);
    });
  });

  it('is continuous: no teleports between frames', () => {
    const g = computeGeometry(390, 480, 16);
    for (let n = 0; n < 50; n++) {
      const path = Array.from({ length: 16 }, () => (Math.random() < 0.5 ? 0 : 1) as Direction);
      const tr = buildTrajectory(g, path);
      let prev = tr.position(0);
      for (let t = 1 / 60; t <= tr.duration; t += 1 / 60) {
        const p = tr.position(t);
        expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(g.spacing * 0.6);
        prev = p;
      }
    }
  });

  it('never goes above the spawn point or below the bins', () => {
    const g = computeGeometry(360, 360, 16);
    for (let n = 0; n < 50; n++) {
      const path = Array.from({ length: 16 }, () => (Math.random() < 0.5 ? 0 : 1) as Direction);
      const tr = buildTrajectory(g, path);
      for (let t = 0; t <= tr.duration; t += 1 / 120) {
        const p = tr.position(t);
        expect(p.y).toBeGreaterThanOrEqual(g.spawnY - 1e-9);
        expect(p.y).toBeLessThanOrEqual(g.binTop + g.binHeight);
      }
    }
  });

  it('rejects a path that does not match the board', () => {
    expect(() => buildTrajectory(computeGeometry(390, 480, 8), [0, 1])).toThrow();
  });
});

describe('cabinet layout', () => {
  const sizes: [number, number][] = [
    [370, 470],
    [340, 372],
    [900, 760],
    [600, 500],
  ];

  it.each(ROW_OPTIONS)('%i rows: pyramid stays inside the neon, bins sit on the shelf', (rows) => {
    for (const [w, h] of sizes) {
      const { geometry: g, cabinet: c } = computeCabinetGeometry(w, h, rows, CABINET_LAYOUT);
      const { field, shelf } = CABINET_LAYOUT;
      const fieldEdge = (y: number, side: 'left' | 'right') => {
        const t = (y - (c.y + field.top * c.h)) / ((field.bottom - field.top) * c.h);
        const top = side === 'left' ? field.leftTop : field.rightTop;
        const bottom = side === 'left' ? field.leftBottom : field.rightBottom;
        return c.x + (top + (bottom - top) * t) * c.w;
      };
      expect(c.y + c.h).toBeCloseTo(h, 6);
      expect(g.topY).toBeGreaterThanOrEqual(c.y + field.top * c.h - 1e-6);
      for (let r = 0; r < rows; r++) {
        const y = pegY(g, r);
        expect(pegX(g, r, 0) - g.spacing * 0.55).toBeGreaterThanOrEqual(
          fieldEdge(y, 'left') - 1e-6,
        );
        expect(pegX(g, r, pegCount(r) - 1) + g.spacing * 0.55).toBeLessThanOrEqual(
          fieldEdge(y, 'right') + 1e-6,
        );
      }
      expect(pegY(g, rows - 1)).toBeLessThan(c.y + field.bottom * c.h);
      expect(g.binTop).toBeGreaterThanOrEqual(c.y + shelf.top * c.h - 1e-6);
      expect(g.binTop + g.binHeight).toBeLessThanOrEqual(c.y + shelf.bottom * c.h + 1e-6);
      expect(binCenterX(g, 0) - g.binWidth / 2).toBeGreaterThanOrEqual(
        c.x + shelf.left * c.w - 1e-6,
      );
      expect(binCenterX(g, rows) + g.binWidth / 2).toBeLessThanOrEqual(
        c.x + shelf.right * c.w + 1e-6,
      );
      expect(g.ballRadius * 2).toBeLessThan(g.spacing - 2 * g.pegRadius);
    }
  });

  it('balls land in the bin from play() inside the cabinet', async () => {
    const play = createFakeServer({ sleep: () => Promise.resolve() });
    for (const rows of [8, 16]) {
      const { geometry: g } = computeCabinetGeometry(370, 470, rows, CABINET_LAYOUT);
      for (let i = 0; i < 300; i++) {
        const result = await play({ bet: 100, rows, risk: 'high' });
        const tr = buildTrajectory(g, result.path);
        const end = tr.position(tr.duration);
        expect(binAt(g, end.x, g.binTop + g.binHeight / 2)).toBe(result.bin);
      }
    }
  });
});
