/**
 * The cabinet drawn around the board, a V-shaped electric guitar body: art plus where its playfield
 * and bin shelf are, as fractions of the image. Measured on `art/cabinet-guitar.png`
 * (1016×1414, cropped to the guitar from `art/cabinet-guitar-source.webp`).
 */
import cabinetUrl from '../assets/cabinet.webp';
import type { Skin } from '../core/storage';

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
  /**
   * Where spare height goes. 'center' (default) splits it above and below the pyramid;
   * 'bottom' sits the pyramid on the shelf, for a pointed frame that is wider further down.
   */
  pyramidAlign?: 'center' | 'bottom';
  /** Largest row gap in pitches (default 1.3); match it to the frame's slope so the rows follow its sides. */
  maxRowGap?: number;
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

/**
 * Second design, the classic look: a flat smoked-glass triangle with one thin neon edge
 * (orange to blue) and a glass tray for the bins. Measured on `art/cabinet-minimal.png`
 * (964×880, cropped from `art/cabinet-minimal-source.webp`). The flat art is drawn stretched
 * to 964×1300, so the pyramid gets the tall phone screen.
 */
export const MINIMAL_LAYOUT: CabinetLayout = {
  aspect: 964 / 1300,
  field: {
    top: 0.1136,
    bottom: 0.8693,
    leftTop: 0.4699,
    rightTop: 0.5301,
    leftBottom: 0.0581,
    rightBottom: 0.9357,
    corner: 4 / 1300,
    topCorner: 30 / 1300,
  },
  channels: { top: 0.8557, bottom: 0.8693 },
  shelf: { top: 0.883, bottom: 0.9432, left: 0.0643, right: 0.9357 },
  maxOverflow: 1,
  pyramidAlign: 'bottom',
  maxRowGap: 1.22,
};

/** `url: null` = the cabinet is drawn in code (see glass.ts), not loaded as an image. */
export const CABINETS: Record<Skin, { url: string | null; layout: CabinetLayout }> = {
  guitar: { url: cabinetUrl, layout: CABINET_LAYOUT },
  minimal: { url: null, layout: MINIMAL_LAYOUT },
};

/** The art carries its own colour; code draws only the steel bin dividers. */
export const CABINET_HAS_NEON = true;
