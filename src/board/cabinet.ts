/**
 * The machine cabinet drawn around the board: art plus where its playfield and bin shelf
 * are, as fractions of the image. Measured on `art/cabinet.png` (896×1200).
 */
import cabinetUrl from '../assets/cabinet.webp';

export interface CabinetLayout {
  /** Image width / height. */
  aspect: number;
  /** Playfield inside the neon tube. Left/right are given at its top and bottom edge. */
  field: {
    top: number;
    bottom: number;
    leftTop: number;
    rightTop: number;
    leftBottom: number;
    rightBottom: number;
  };
  /** Recessed shelf where the bins sit. */
  shelf: { top: number; bottom: number; left: number; right: number };
}

export const CABINET_LAYOUT: CabinetLayout = {
  aspect: 896 / 1200,
  field: {
    top: 0.115,
    bottom: 0.805,
    leftTop: 0.235,
    rightTop: 0.765,
    leftBottom: 0.12,
    rightBottom: 0.88,
  },
  shelf: { top: 0.855, bottom: 0.94, left: 0.095, right: 0.905 },
};

export const CABINET_URL: string = cabinetUrl;

/** The art already carries neon decorations outside the pyramid zone; code draws only the bin channels. */
export const CABINET_HAS_NEON = true;
