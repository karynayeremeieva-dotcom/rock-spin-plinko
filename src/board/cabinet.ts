/**
 * The cabinet drawn around the board, a V-shaped electric guitar body: art plus where its playfield
 * and bin shelf are, as fractions of the image. Measured on `art/cabinet-guitar.png`
 * (1016×1414, cropped to the guitar from `art/cabinet-guitar-source.webp`).
 */
import cabinetUrl from '../assets/cabinet.webp';
import minimalUrl from '../assets/cabinet-minimal.webp';
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
  /**
   * Rows run parallel to the plate's sides: the row gap is set from the sides' slope, so
   * the pyramid keeps an even margin to the frame from top to bottom.
   */
  rowsFollowSides?: boolean;
  /** Bins spread out to fill the shelf's width (their pitch may exceed the peg pitch a little). */
  binsFillShelf?: boolean;
  /** How much wider than its art the cabinet may be drawn (default 1.18). */
  maxStretch?: number;
  /** Closest a peg centre may come to the plate's edge, in pitches (default 0.6). */
  pegEdge?: number;
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
 * Second design, the classic look: a black obsidian triangle in a mirror-chrome bevel with
 * light inlaid in it, amber on the left and blue on the right, and a chrome-rimmed tray for
 * the bins. The art's grey inner facet is repainted as a soft graphite plate (lighter at the
 * top, with a faint warm and cool glow along the sides) that runs right up to
^ * the lit bevel, and the playfield ends there. Measured on `art/cabinet-minimal.png`
 * (1024×1290, cropped from `art/cabinet-minimal-source.webp`). The pyramid sits on the tray and its row gap matches
 * the sides' slope, so the rows run parallel to the bevel with an even margin.
 */
export const MINIMAL_LAYOUT: CabinetLayout = {
  aspect: 1024 / 1290,
  field: {
    top: 0.1318,
    bottom: 0.8574,
    leftTop: 0.4771,
    rightTop: 0.5248,
    leftBottom: 0.0751,
    rightBottom: 0.9269,
    corner: 4 / 1290,
    topCorner: 4 / 1290,
  },
  channels: { top: 0.845, bottom: 0.8574 },
  shelf: { top: 0.8775, bottom: 0.9411, left: 0.083, right: 0.916 },
  maxOverflow: 1,
  pyramidAlign: 'bottom',
  rowsFollowSides: true,
  binsFillShelf: true,
  // the bevelled frame must not be distorted
  maxStretch: 1,
  pegEdge: 0.5,
};

export const CABINETS: Record<Skin, { url: string; layout: CabinetLayout }> = {
  guitar: { url: cabinetUrl, layout: CABINET_LAYOUT },
  minimal: { url: minimalUrl, layout: MINIMAL_LAYOUT },
};

/** The art carries its own colour; code draws only the steel bin dividers. */
export const CABINET_HAS_NEON = true;
