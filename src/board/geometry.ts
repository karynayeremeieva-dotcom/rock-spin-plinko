import type { CabinetLayout } from './cabinet';

/**
 * Board layout in CSS pixels. Pure math, no Canvas.
 *
 * Row r (0-based) has r + 3 pegs. A ball starts on the middle peg of row 0 and after each
 * bounce moves to peg j (left) or j + 1 (right) of the next row. After the last row it falls
 * into one of rows + 1 bins, and the bin index equals the number of right bounces.
 */
export interface BoardGeometry {
  width: number;
  height: number;
  rows: number;
  /** Horizontal distance between neighbouring pegs = bin pitch. */
  spacing: number;
  /** Vertical distance between rows. */
  rowGap: number;
  pegRadius: number;
  ballRadius: number;
  centerX: number;
  /** y of the ball spawn point. */
  spawnY: number;
  /** y of row 0. */
  topY: number;
  binTop: number;
  binHeight: number;
  binWidth: number;
}

const ROW_GAP_RATIO = 0.92;
const SPAWN_RATIO = 0.9;
const BIN_GAP_RATIO = 0.55;
const BIN_HEIGHT_RATIO = 1.15;
const BOTTOM_RATIO = 0.35;
/** How far spare height may stretch rows and bins on narrow, tall boards (phones). */
const MAX_ROW_GAP_RATIO = 1.0; // more than ~1.0 breaks the pyramid look (reads as a ladder)
const MAX_BIN_HEIGHT_RATIO = 1.5;

export function computeGeometry(width: number, height: number, rows: number): BoardGeometry {
  const heightUnits =
    SPAWN_RATIO + (rows - 1) * ROW_GAP_RATIO + BIN_GAP_RATIO + BIN_HEIGHT_RATIO + BOTTOM_RATIO;
  // Bottom row has rows + 2 pegs; half a pitch of padding on each side.
  const spacing = Math.max(1, Math.min(width / (rows + 2), height / heightUnits));

  // When width is the limit (phones, many rows) height is left over: spend it on taller
  // bins first, then on more vertical room between rows, so the board fills its area.
  let spare = Math.max(0, height - spacing * heightUnits);
  const binExtra = Math.min(spare, spacing * (MAX_BIN_HEIGHT_RATIO - BIN_HEIGHT_RATIO));
  spare -= binExtra;
  const rowExtra =
    rows > 1 ? Math.min(spare / (rows - 1), spacing * (MAX_ROW_GAP_RATIO - ROW_GAP_RATIO)) : 0;
  spare -= rowExtra * (rows - 1);

  const rowGap = spacing * ROW_GAP_RATIO + rowExtra;
  const binHeight = spacing * BIN_HEIGHT_RATIO + binExtra;
  // Anchor to the bottom: bins sit right above the results feed, any rest stays on top.
  const spawnY = Math.max(0, spare);
  const topY = spawnY + spacing * SPAWN_RATIO;
  const lastRowY = topY + (rows - 1) * rowGap;
  const binTop = lastRowY + spacing * BIN_GAP_RATIO;

  return {
    width,
    height,
    rows,
    spacing,
    rowGap,
    pegRadius: Math.max(2.5, spacing * 0.19),
    ballRadius: Math.max(3.5, spacing * 0.27),
    centerX: width / 2,
    spawnY,
    topY,
    binTop,
    binHeight,
    binWidth: spacing * 0.94,
  };
}

export interface CabinetRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fraction of the canvas width the cabinet may take (sides may go a bit off-screen). */
const CABINET_MAX_OVERFLOW = 1.12;
/** Neon outline distance from the outermost pegs, in pitches. */
export const NEON_MARGIN = 0.75;
/** Gap between the two parallel neon tubes, in pitches. */
export const NEON_GAP = 0.3;
/** Largest row gap inside the cabinet, in pitches. */
const MAX_ROW_GAP = 1.3;
/** From the last row to the plate's bottom edge, in pitches. */
const BOTTOM_GAP = 0.8;
/** From the top of the plate to row 0, in pitches (the spawn point sits in between). */
const TOP_GAP = 1.1;
/** Closest a peg centre may come to the plate edge, in pitches. */
export const PEG_EDGE = 0.6;
/** Gap between the top of the field and the neon roof over the spawn point, in pitches. */
export const ROOF_RATIO = 0.8;
/** How much wider than its art the cabinet may be drawn (rivets and neon hide the stretch). */
const CABINET_MAX_STRETCH = 1.18;

export interface CabinetField {
  top: number;
  bottom: number;
  /** Bin channels between the plate's bottom edge and the neon under it. */
  channelTop: number;
  channelBottom: number;
  /** Left and right edge of the dark plate at height y (rounded corners included). */
  edgesAt(y: number): [number, number];
}

/**
 * Board laid out inside the machine cabinet: the cabinet is scaled to fit the canvas
 * (bottom-aligned, centred; on narrow screens its outer frame may be cropped a little).
 * Row 0 sits just under the top of the dark plate, the last row just above the neon
 * channels, and the pitch is the largest that keeps every row on the plate and the bins
 * on the shelf. The renderer fills the rest of each row with decorative pegs.
 */
export function computeCabinetGeometry(
  width: number,
  height: number,
  rows: number,
  layout: CabinetLayout,
): { geometry: BoardGeometry; cabinet: CabinetRect; field: CabinetField } {
  const { field, shelf, aspect } = layout;
  const overflow = layout.maxOverflow ?? CABINET_MAX_OVERFLOW;
  const cabH = Math.min(height, (width * overflow) / aspect);
  const cabW = Math.min(width * overflow, cabH * aspect * CABINET_MAX_STRETCH);
  const cab: CabinetRect = { x: (width - cabW) / 2, y: height - cabH, w: cabW, h: cabH };
  const py = (fy: number) => cab.y + fy * cab.h;

  const fieldTop = py(field.top);
  const fieldBottom = py(field.bottom);
  const straight = (y: number): [number, number] => {
    const t = (y - fieldTop) / (fieldBottom - fieldTop);
    return [
      cab.x + (field.leftTop + (field.leftBottom - field.leftTop) * t) * cab.w,
      cab.x + (field.rightTop + (field.rightBottom - field.rightTop) * t) * cab.w,
    ];
  };
  // Rounded corners: circles (ellipses once the art is stretched) tangent to the side and
  // to the top or bottom edge. Between an edge and its tangent point the plate follows the arc.
  const sideSlope =
    ((field.leftBottom - field.leftTop) / (field.bottom - field.top)) * (cab.w / cab.h);
  const lean = Math.hypot(1, sideSlope);
  const fillet = (radius: number, centerY: number) => {
    const ry = radius * cab.h;
    const rx = (radius / aspect) * cab.w;
    const [l, r] = straight(centerY);
    return {
      ry,
      rx,
      centerY,
      leftCx: l + rx * lean,
      rightCx: r - rx * lean,
      // the side touches the circle above its centre (the side leans outwards going down)
      tangentY: centerY + (ry * sideSlope) / lean,
    };
  };
  const bottomArc = fillet(field.corner, fieldBottom - field.corner * cab.h);
  const topArc = fillet(field.topCorner, fieldTop + field.topCorner * cab.h);
  const onArc = (arc: ReturnType<typeof fillet>, y: number): [number, number] => {
    const dy = Math.max(-1, Math.min(1, (y - arc.centerY) / arc.ry));
    const k = Math.sqrt(Math.max(0, 1 - dy * dy));
    return [arc.leftCx - arc.rx * k, arc.rightCx + arc.rx * k];
  };
  const edgesAt = (y: number): [number, number] => {
    const [l, r] = straight(y);
    const arc = y > bottomArc.tangentY ? bottomArc : y < topArc.tangentY ? topArc : null;
    if (!arc) return [l, r];
    const [al, ar] = onArc(arc, y);
    return [Math.max(l, al), Math.min(r, ar)];
  };
  const shelfTop = py(shelf.top);
  const shelfHeight = py(shelf.bottom) - shelfTop;
  const shelfWidth = (shelf.right - shelf.left) * cab.w;
  const centerX = width / 2;

  const layoutFor = (s: number) => {
    const top = fieldTop + TOP_GAP * s;
    const lastY = fieldBottom - BOTTOM_GAP * s;
    const free = rows > 1 ? (lastY - top) / (rows - 1) : s;
    const rowGap = Math.min(MAX_ROW_GAP * s, free);
    // Height the rows can't use is shared above and below, so the pyramid sits centred on
    // the plate instead of leaving all of it at the bottom.
    const spare = Math.max(0, lastY - top - (rows - 1) * rowGap);
    const gaps = (TOP_GAP + BOTTOM_GAP) * s + spare; // room above row 0 plus below the last row
    const topY = fieldTop + Math.min(TOP_GAP * s + spare, Math.max(TOP_GAP * s, gaps / 2));
    return { topY, rowGap, free };
  };
  // The plate's corners are rounded, so every row is checked against its edges.
  const fits = (s: number) => {
    const { topY, rowGap, free } = layoutFor(s);
    if (free < ROW_GAP_RATIO * s || (rows + 1.2) * s > shelfWidth) return false;
    for (let r = 0; r < rows; r++) {
      const half = ((r + 2) / 2 + PEG_EDGE) * s;
      const [left, right] = edgesAt(topY + r * rowGap);
      if (centerX - half < left || centerX + half > right) return false;
    }
    return true;
  };
  let lo = 1;
  let hi = Math.max(1, fieldBottom - fieldTop);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  const spacing = lo;
  const { topY, rowGap } = layoutFor(spacing);
  const binHeight = Math.min(shelfHeight * 0.82, spacing * 2.1);

  return {
    cabinet: cab,
    field: {
      top: fieldTop,
      bottom: fieldBottom,
      channelTop: py(layout.channels.top),
      channelBottom: py(layout.channels.bottom),
      edgesAt,
    },
    geometry: {
      width,
      height,
      rows,
      spacing,
      rowGap,
      // Floors keep pegs and the ball visible on tiny boards; they still leave the ball room
      // to pass between two pegs at 16 rows on the smallest phone.
      pegRadius: Math.max(2, spacing * 0.19),
      ballRadius: Math.max(3, spacing * 0.27),
      centerX,
      spawnY: topY - spacing * SPAWN_RATIO,
      topY,
      binTop: shelfTop + (shelfHeight - binHeight) / 2,
      binHeight,
      binWidth: spacing * 0.94,
    },
  };
}

export function pegCount(row: number): number {
  return row + 3;
}

export function pegX(g: BoardGeometry, row: number, index: number): number {
  return g.centerX + (index - (row + 2) / 2) * g.spacing;
}

export function pegY(g: BoardGeometry, row: number): number {
  return g.topY + row * g.rowGap;
}

export function binCenterX(g: BoardGeometry, bin: number): number {
  return g.centerX + (bin - g.rows / 2) * g.spacing;
}

/** Bin under the point, or -1. Used for hover / tap tooltips. */
export function binAt(g: BoardGeometry, x: number, y: number): number {
  if (y < g.binTop || y > g.binTop + g.binHeight) return -1;
  // `+ 0` turns Math.round's -0 (points just left of bin 0's centre) into 0.
  const bin = Math.round((x - g.centerX) / g.spacing + g.rows / 2) + 0;
  if (bin < 0 || bin > g.rows) return -1;
  return Math.abs(x - binCenterX(g, bin)) <= g.binWidth / 2 ? bin : -1;
}
