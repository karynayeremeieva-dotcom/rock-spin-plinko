/**
 * The machine cabinet drawn around the board: art plus where its playfield and bin shelf
 * are, as fractions of the image. Measured on `art/cabinet.png` (1792×2400, drawn from a
 * 896×1200 layout).
 */
import cabinetUrl from '../assets/cabinet.webp';

export interface CabinetLayout {
  /** Image width / height. */
  aspect: number;
  /**
   * Dark trapezoid plate the pegs sit on. Left/right are given at its top and at its bottom
   * edge as if the sides ran straight down; the corners are rounded with `topCorner` and
   * `corner` (radii as fractions of the image height).
   */
  field: {
    top: number;
    bottom: number;
    leftTop: number;
    rightTop: number;
    leftBottom: number;
    rightBottom: number;
    corner: number;
    topCorner: number;
  };
  /** Gap between the plate's bottom edge and the neon tube under it: the bin channels. */
  channels: { top: number; bottom: number };
  /** Recessed shelf where the bins sit. */
  shelf: { top: number; bottom: number; left: number; right: number };
}

export const CABINET_LAYOUT: CabinetLayout = {
  aspect: 896 / 1200,
  field: {
    top: 0.121,
    bottom: 0.7833,
    leftTop: 0.4354,
    rightTop: 0.5646,
    leftBottom: 0.1305,
    rightBottom: 0.8702,
    corner: 30 / 1200,
    topCorner: 40 / 1200,
  },
  channels: { top: 0.7917, bottom: 0.8125 },
  shelf: { top: 0.855, bottom: 0.94, left: 0.095, right: 0.905 },
};

export const CABINET_URL: string = cabinetUrl;

/** The art already carries neon decorations outside the pyramid zone; code draws only the bin channels. */
export const CABINET_HAS_NEON = true;
