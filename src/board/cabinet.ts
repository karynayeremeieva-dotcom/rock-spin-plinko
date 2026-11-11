/**
 * The cabinet drawn around the board, a V-shaped electric guitar body: art plus where its playfield
 * and bin shelf are, as fractions of the image. Measured on `art/cabinet-guitar.png`
 * (1016×1414, cropped to the guitar from `art/cabinet-guitar-source.webp`).
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
  /** How far past the canvas width the art may go (default 1.12: the frame may be cropped). */
  maxOverflow?: number;
}

export const CABINET_LAYOUT: CabinetLayout = {
  aspect: 1016 / 1414,
  field: {
    top: 0.176,
    bottom: 0.8088,
    leftTop: 0.4335,
    rightTop: 0.5659,
    leftBottom: 0.1034,
    rightBottom: 0.9031,
    corner: 4 / 1414,
    topCorner: 30 / 1414,
  },
  channels: { top: 0.7925, bottom: 0.8088 },
  shelf: { top: 0.8164, bottom: 0.8692, left: 0.114, right: 0.8966 },
  // The wing tips are part of the silhouette: never crop them.
  maxOverflow: 1,
};

export const CABINET_URL: string = cabinetUrl;

/** The art carries its own colour; code draws only the steel bin dividers. */
export const CABINET_HAS_NEON = true;
