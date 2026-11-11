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
    pegRadius: Math.max(2, spacing * 0.15),
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
const MAX_ROW_GAP = 1.12;
/** Minimum height of the neon channels between the last row and the bin shelf, in pitches. */
const CHANNEL_RATIO = 1.3;
/** Gap between the top of the field and the neon roof over the spawn point, in pitches. */
export const ROOF_RATIO = 0.8;
/** How much wider than its art the cabinet may be drawn (rivets and neon hide the stretch). */
const CABINET_MAX_STRETCH = 1.18;

/**
 * Board laid out inside the machine cabinet: the cabinet is scaled to fit the canvas
 * (bottom-aligned, centred; on narrow screens its outer frame may be cropped a little),
 * the pyramid fills the playfield and the bins sit in the shelf.
 */
export function computeCabinetGeometry(
  width: number,
  height: number,
  rows: number,
  layout: CabinetLayout,
): { geometry: BoardGeometry; cabinet: CabinetRect; field: { top: number; bottom: number } } {
  const { field, shelf, aspect } = layout;
  const cabH = Math.min(height, (width * CABINET_MAX_OVERFLOW) / aspect);
  const cabW = Math.min(width * CABINET_MAX_OVERFLOW, cabH * aspect * CABINET_MAX_STRETCH);
  const cab: CabinetRect = { x: (width - cabW) / 2, y: height - cabH, w: cabW, h: cabH };
  const py = (fy: number) => cab.y + fy * cab.h;

  const fieldTop = py(field.top);
  const fieldBottom = py(field.bottom);
  const fieldBottomWidth = (field.rightBottom - field.leftBottom) * cab.w;
  const shelfTop = py(shelf.top);
  const shelfHeight = py(shelf.bottom) - shelfTop;
  const shelfWidth = (shelf.right - shelf.left) * cab.w;

  // Widest row spans rows + 1 pitches, plus the neon outline NEON_MARGIN outside it on
  // each side; bins span rows + 1 pitches.
  const bySpan = Math.min(
    fieldBottomWidth / (rows + 1 + 2 * (NEON_MARGIN + NEON_GAP) + 0.3),
    shelfWidth / (rows + 1.2),
  );
  const heightUnits = ROOF_RATIO + SPAWN_RATIO + (rows - 1) * ROW_GAP_RATIO + CHANNEL_RATIO;
  const spacing = Math.max(1, Math.min(bySpan, (fieldBottom - fieldTop) / heightUnits));

  // Short neon channels sit right above the shelf. Spare height first opens the rows up a
  // little (at most to 1.12 pitch, beyond that it reads as a ladder); what is still left
  // is split above and below.
  const spare = fieldBottom - fieldTop - spacing * heightUnits;
  const rowExtra =
    rows > 1
      ? Math.max(0, Math.min(spare / (rows - 1), spacing * (MAX_ROW_GAP - ROW_GAP_RATIO)))
      : 0;
  const rowGap = spacing * ROW_GAP_RATIO + rowExtra;
  // Whatever is still left is split evenly above and below, so the pyramid sits centred in
  // the panel (the lower half lengthens the channels a little).
  const above = Math.max(0, spare - rowExtra * (rows - 1)) / 2;
  const topY = fieldTop + above + spacing * (ROOF_RATIO + SPAWN_RATIO);
  const binHeight = Math.min(shelfHeight * 0.82, spacing * 2.1);

  return {
    cabinet: cab,
    field: { top: fieldTop, bottom: fieldBottom },
    geometry: {
      width,
      height,
      rows,
      spacing,
      rowGap,
      pegRadius: Math.max(2, spacing * 0.15),
      ballRadius: Math.max(3.5, spacing * 0.27),
      centerX: width / 2,
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
