/** Neon colour schemes: two neighbouring hues for the two parallel tubes. */
export interface NeonColors {
  /** Inner tube, closer to the pegs; also every other bin channel. */
  a: string;
  /** Outer tube, the wings and the other channels. */
  b: string;
}

export const NEON_SCHEMES = {
  /** Electric blue + cyan: the concept's cool pair without the purple. */
  cool: { a: '#3b7dff', b: '#22e0ff' },
  /** Molten orange + amber. */
  warm: { a: '#ff6a1a', b: '#ffbe3c' },
  /** Cyan + amber. */
  split: { a: '#22d3ff', b: '#ffb21e' },
} satisfies Record<string, NeonColors>;

export type NeonScheme = keyof typeof NEON_SCHEMES;

type Pt = [number, number];

/** Replaces each corner of a polyline with a smooth arc of radius ≤ r. */
export function roundCorners(pts: readonly Pt[], r: number, steps = 6): Pt[] {
  if (pts.length < 3) return [...pts];
  const out: Pt[] = [pts[0] as Pt];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1] as Pt;
    const [cx, cy] = pts[i] as Pt;
    const [nx, ny] = pts[i + 1] as Pt;
    const l1 = Math.hypot(cx - px, cy - py);
    const l2 = Math.hypot(nx - cx, ny - cy);
    const k = Math.min(r, l1 / 2, l2 / 2);
    if (k < 0.5) {
      out.push([cx, cy]);
      continue;
    }
    const a: Pt = [cx - ((cx - px) / l1) * k, cy - ((cy - py) / l1) * k];
    const b: Pt = [cx + ((nx - cx) / l2) * k, cy + ((ny - cy) / l2) * k];
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      // quadratic Bézier through the corner: smooth, no kinks
      out.push([
        (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * cx + t * t * b[0],
        (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * cy + t * t * b[1],
      ]);
    }
  }
  out.push(pts[pts.length - 1] as Pt);
  return out;
}

/** Splits a polyline into short pieces, each with its position 0..1 along the length. */
export function resample(pts: readonly Pt[], step: number): { p: Pt; t: number }[] {
  const lengths = [0];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1] as Pt;
    const [bx, by] = pts[i] as Pt;
    lengths.push((lengths[i - 1] ?? 0) + Math.hypot(bx - ax, by - ay));
  }
  const total = lengths[lengths.length - 1] ?? 0;
  if (total === 0) return [];
  const out: { p: Pt; t: number }[] = [];
  let seg = 1;
  for (let d = 0; d <= total; d += step) {
    while (seg < pts.length - 1 && (lengths[seg] ?? 0) < d) seg++;
    const l0 = lengths[seg - 1] ?? 0;
    const l1 = lengths[seg] ?? total;
    const u = l1 > l0 ? (d - l0) / (l1 - l0) : 0;
    const [ax, ay] = pts[seg - 1] as Pt;
    const [bx, by] = pts[seg] as Pt;
    out.push({ p: [ax + (bx - ax) * u, ay + (by - ay) * u], t: d / total });
  }
  out.push({ p: pts[pts.length - 1] as Pt, t: 1 });
  return out;
}
