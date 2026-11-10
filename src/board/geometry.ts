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
const BIN_HEIGHT_RATIO = 0.95;
const BOTTOM_RATIO = 0.35;

export function computeGeometry(width: number, height: number, rows: number): BoardGeometry {
  const heightUnits =
    SPAWN_RATIO + (rows - 1) * ROW_GAP_RATIO + BIN_GAP_RATIO + BIN_HEIGHT_RATIO + BOTTOM_RATIO;
  // Bottom row has rows + 2 pegs; half a pitch of padding on each side.
  const spacing = Math.max(1, Math.min(width / (rows + 2), height / heightUnits));
  const rowGap = spacing * ROW_GAP_RATIO;
  const contentHeight = spacing * heightUnits;
  // Anchor to the bottom: bins sit right above the results feed, spare room stays on top.
  const offsetY = Math.max(0, height - contentHeight);

  const spawnY = offsetY;
  const topY = spawnY + spacing * SPAWN_RATIO;
  const lastRowY = topY + (rows - 1) * rowGap;
  const binTop = lastRowY + spacing * BIN_GAP_RATIO;

  return {
    width,
    height,
    rows,
    spacing,
    rowGap,
    pegRadius: Math.max(1.5, spacing * 0.11),
    ballRadius: Math.max(3, spacing * 0.22),
    centerX: width / 2,
    spawnY,
    topY,
    binTop,
    binHeight: spacing * BIN_HEIGHT_RATIO,
    binWidth: spacing * 0.9,
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
  const bin = Math.round((x - g.centerX) / g.spacing + g.rows / 2);
  if (bin < 0 || bin > g.rows) return -1;
  return Math.abs(x - binCenterX(g, bin)) <= g.binWidth / 2 ? bin : -1;
}
