/**
 * Deterministic ball flight along a known path. No physics engine: physics cannot
 * guarantee the bin, this can. The ball falls onto the top peg, then bounces in a
 * parabolic arc from peg to peg, and finally drops into its bin.
 *
 * Small random offsets (contact point, bounce height) only change how the flight looks;
 * the sequence of pegs and the landing bin come strictly from `path`.
 */
import type { Direction } from '../core/rng';
import { binCenterX, pegX, pegY, type BoardGeometry } from './geometry';

export interface Point {
  x: number;
  y: number;
}

interface Segment {
  t0: number;
  t1: number;
  x0: number;
  y0: number;
  x1: number;
  /** Initial vertical velocity, px/s (negative = up). */
  vy: number;
  /** Gravity for this segment, px/s². */
  g: number;
}

export interface Trajectory {
  /** Seconds from spawn to landing. */
  duration: number;
  /** Times at which the ball touches a peg, one per row. */
  hits: number[];
  /** Peg index touched at each row. */
  pegs: number[];
  bin: number;
  position(t: number): Point;
}

export interface TrajectoryOptions {
  /** Seconds per row bounce. */
  bounceTime?: number;
  /** Cosmetic randomness in [0, 1). Defaults to Math.random: it never affects the outcome. */
  random?: () => number;
}

/** Default bounce time: a touch slower on short boards so 8 rows don't feel rushed. */
export function defaultBounceTime(rows: number): number {
  return 0.12 + (0.05 * (16 - rows)) / 8;
}

export function buildTrajectory(
  g: BoardGeometry,
  path: readonly Direction[],
  { bounceTime = defaultBounceTime(g.rows), random = Math.random }: TrajectoryOptions = {},
): Trajectory {
  if (path.length !== g.rows) {
    throw new Error(`Path has ${path.length} steps, board has ${g.rows} rows`);
  }
  const jitter = (amount: number) => (random() * 2 - 1) * amount;
  const contactY = (row: number) => pegY(g, row) - g.pegRadius - g.ballRadius * 0.9;

  // Peg touched on each row.
  const pegs: number[] = [];
  let index = 1;
  for (let row = 0; row < g.rows; row++) {
    pegs.push(index);
    index += path[row] ?? 0;
  }
  const bin = index - 1;

  // Contact points: slightly on the side the ball is about to bounce to.
  const contacts: Point[] = pegs.map((peg, row) => {
    const side = path[row] === 1 ? 1 : -1;
    return {
      x: pegX(g, row, peg) + side * g.ballRadius * 0.35 + jitter(g.ballRadius * 0.12),
      y: contactY(row),
    };
  });
  const landing: Point = {
    x: binCenterX(g, bin) + jitter(g.binWidth * 0.12),
    y: g.binTop + g.ballRadius * 0.4,
  };

  const segments: Segment[] = [];
  const hits: number[] = [];

  // 1. Free fall from rest onto the first peg.
  const first = contacts[0] ?? landing;
  const fallDistance = first.y - g.spawnY;
  const fallTime = Math.max(0.12, bounceTime * 1.5);
  segments.push({
    t0: 0,
    t1: fallTime,
    x0: first.x,
    y0: g.spawnY,
    x1: first.x,
    vy: 0,
    g: (2 * fallDistance) / (fallTime * fallTime),
  });
  let t = fallTime;
  hits.push(t);

  // 2. Bounce arcs from peg to peg, then into the bin.
  for (let row = 0; row < g.rows; row++) {
    const from = contacts[row] ?? landing;
    const to = row + 1 < g.rows ? (contacts[row + 1] ?? landing) : landing;
    const isLast = row + 1 === g.rows;
    const duration = bounceTime * (isLast ? 1.25 : 1) * (0.94 + random() * 0.12);
    const apex = g.rowGap * (0.16 + random() * 0.14);
    segments.push(arc(t, duration, from, to, apex));
    t += duration;
    if (!isLast) hits.push(t);
  }

  const duration = t;
  return {
    duration,
    hits,
    pegs,
    bin,
    position(time: number): Point {
      const clamped = Math.min(Math.max(time, 0), duration);
      const seg = findSegment(segments, clamped);
      const tau = clamped - seg.t0;
      const s = (clamped - seg.t0) / (seg.t1 - seg.t0);
      return {
        x: seg.x0 + (seg.x1 - seg.x0) * s,
        y: seg.y0 + seg.vy * tau + 0.5 * seg.g * tau * tau,
      };
    },
  };
}

/**
 * Parabola from `from` to `to` in `duration` seconds that first rises by `apex` px.
 * Solving y(T) = Δ with v0 = −√(2·g·apex) gives √g = (√(2·apex) + √(2·apex + 2Δ)) / T.
 */
function arc(t0: number, duration: number, from: Point, to: Point, apex: number): Segment {
  const delta = to.y - from.y;
  const a = Math.sqrt(2 * apex);
  const b = Math.sqrt(Math.max(0, 2 * apex + 2 * delta));
  const u = (a + b) / duration;
  return {
    t0,
    t1: t0 + duration,
    x0: from.x,
    y0: from.y,
    x1: to.x,
    vy: -u * a,
    g: u * u,
  };
}

function findSegment(segments: readonly Segment[], t: number): Segment {
  // Few segments (≤ 18): linear scan is faster than binary search here.
  for (const seg of segments) if (t <= seg.t1) return seg;
  const last = segments[segments.length - 1];
  if (!last) throw new Error('Empty trajectory');
  return last;
}
