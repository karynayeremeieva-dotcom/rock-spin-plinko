/** Board colours and pre-rendered sprites. Drawing gradients once, then blitting, keeps 50 balls cheap. */

export const BOARD_COLORS = {
  peg: { rim: '#2a2c31', base: '#8a9099', light: '#f3f5f8' },
  pegGlow: 'rgba(255, 140, 40, 1)',
  /** Guitar strings: chrome when idle, molten orange while vibrating. */
  string: '#f4f6f9',
  stringBody: '#7d838c',
  /** Dark plate behind the pyramid. */
  backplate: 'rgba(5, 5, 7, 0.82)',
  /** Neon tubes inside the cabinet playfield. */
  neonLeft: '#ff8a2a',
  neonRight: '#3d8bff',
  stringHot: 'rgba(255, 150, 50, 1)',
  ball: ['#fffbea', '#ffe7a3', '#ffb43c', 'rgba(255, 106, 24, 0.55)', 'rgba(255, 60, 0, 0)'],
  binText: '#140d08',
} as const;

/** Cold electric blue in the centre → steel → amber → molten red at the edges. No purple. */
const BIN_STOPS: readonly [number, readonly [number, number, number]][] = [
  [0, [47, 125, 255]],
  [0.3, [88, 148, 205]],
  [0.45, [214, 168, 86]],
  [0.62, [255, 164, 36]],
  [0.82, [255, 100, 24]],
  [1, [255, 42, 42]],
];

export type Rgb = readonly [number, number, number];

/** Colour of a bin by its distance from the centre (0 = centre, 1 = edge). */
export function binColor(distance: number): Rgb {
  const d = Math.min(1, Math.max(0, distance));
  for (let i = 1; i < BIN_STOPS.length; i++) {
    const [p1, c1] = BIN_STOPS[i] as (typeof BIN_STOPS)[number];
    if (d <= p1) {
      const [p0, c0] = BIN_STOPS[i - 1] as (typeof BIN_STOPS)[number];
      const t = (d - p0) / (p1 - p0);
      return [0, 1, 2].map((j) => Math.round((c0[j] ?? 0) + ((c1[j] ?? 0) - (c0[j] ?? 0)) * t)) as [
        number,
        number,
        number,
      ];
    }
  }
  return BIN_STOPS[BIN_STOPS.length - 1]?.[1] ?? [255, 42, 42];
}

export const rgb = ([r, g, b]: Rgb, a = 1) => `rgba(${r}, ${g}, ${b}, ${a})`;

const shade = ([r, g, b]: Rgb, k: number): Rgb =>
  k >= 0
    ? [r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k]
    : [r * (1 + k), g * (1 + k), b * (1 + k)];

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  return { canvas, ctx };
}

/** Chrome rivet. Sprite size = 2 × radius (device px). */
export function pegSprite(radius: number): HTMLCanvasElement {
  // Whole pixels, centred: every peg is then drawn 1:1 from the same bitmap.
  const size = Math.ceil(radius * 2 + 2);
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  ctx.fillStyle = BOARD_COLORS.peg.rim;
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(
    c - radius * 0.35,
    c - radius * 0.4,
    radius * 0.1,
    c,
    c,
    radius * 0.95,
  );
  g.addColorStop(0, BOARD_COLORS.peg.light);
  g.addColorStop(0.45, BOARD_COLORS.peg.base);
  g.addColorStop(1, BOARD_COLORS.peg.rim);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, radius * 0.86, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/** Soft additive glow. Sprite size = 2 × radius. */
export function glowSprite(radius: number, color: string): HTMLCanvasElement {
  const size = radius * 2;
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.45)'));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** Glowing hot ball. The solid core is ~40 % of the sprite radius. */
export const BALL_SPRITE_SCALE = 1.45;

/**
 * Glowing hot ball: a crisp lit sphere (hard edge, specular highlight) inside a narrow halo.
 * The hard edge keeps balls sharp even with many of them on the board.
 */
export function ballSprite(ballRadius: number): HTMLCanvasElement {
  const R = ballRadius * BALL_SPRITE_SCALE;
  const r = ballRadius;
  const { canvas, ctx } = makeCanvas(R * 2, R * 2);
  // narrow halo
  const halo = ctx.createRadialGradient(R, R, r * 0.8, R, R, R);
  halo.addColorStop(0, 'rgba(255, 150, 50, 0.4)');
  halo.addColorStop(0.5, 'rgba(255, 110, 20, 0.1)');
  halo.addColorStop(1, 'rgba(255, 90, 10, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, R * 2, R * 2);
  // sphere with light from the top-left
  const body = ctx.createRadialGradient(R - r * 0.35, R - r * 0.4, r * 0.05, R, R, r);
  body.addColorStop(0, '#fffdf2');
  body.addColorStop(0.35, '#ffe39a');
  body.addColorStop(0.75, '#ffa22e');
  body.addColorStop(1, '#e8560f');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(R, R, r, 0, Math.PI * 2);
  ctx.fill();
  // thin darker rim for a clean silhouette
  ctx.strokeStyle = 'rgba(150, 40, 0, 0.6)';
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();
  return canvas;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Largest font size at which every label (without "×") fits a bin of this size. */
/** Text on a bin: the plain multiplier, never "×", so every bin reads the same. */
export function binLabel(m: number): string {
  return formatMultiplier(m, false);
}

export function binLabelSize(
  labels: readonly number[],
  width: number,
  height: number,
  fontFamily: string,
): number {
  const { ctx } = makeCanvas(4, 4);
  let size = Math.min(height * 0.62, width * 0.7);
  const fits = () => labels.every((m) => ctx.measureText(binLabel(m)).width <= width * 0.88);
  ctx.font = `800 ${size}px ${fontFamily}`;
  while (!fits() && size > 4) {
    size -= 0.5;
    ctx.font = `800 ${size}px ${fontFamily}`;
  }
  return size;
}

export function formatMultiplier(m: number, withSign: boolean): string {
  const text = m >= 100 ? String(Math.round(m)) : String(m);
  return withSign ? `${text}×` : text;
}

export interface BinSpriteSet {
  normal: HTMLCanvasElement;
  lit: HTMLCanvasElement;
  /** Extra px around the bin in the sprite (room for the glow). */
  pad: number;
}

/**
 * Guitar-amp grille bin: coloured cabinet, woven grille dots, multiplier label.
 * Sizes in device pixels.
 */
/**
 * Bin as a studio-console tile: flat dark body, white digits and a coloured indicator bar
 * along the bottom. The lit version tints the tile and lights the bar up.
 * Sizes in device pixels.
 */
export function binSprites(
  width: number,
  height: number,
  color: Rgb,
  label: number,
  fontFamily: string,
  /** One font size for the whole row, so the digits line up (see binLabelSize). */
  fontSize?: number,
): BinSpriteSet {
  const pad = Math.ceil(height * 0.5);
  const draw = (lit: boolean) => {
    const { canvas, ctx } = makeCanvas(width + pad * 2, height + pad * 2);
    const x = pad;
    const y = pad;
    const r = Math.min(width, height) * 0.18;
    const base = lit ? shade(color, 0.3) : color;

    // The whole tile carries the bin's colour (cold centre, hot edges), lit softly from above.
    if (lit) {
      ctx.shadowColor = rgb(color, 0.9);
      ctx.shadowBlur = pad * 0.8;
    }
    const body = ctx.createLinearGradient(0, y, 0, y + height);
    body.addColorStop(0, rgb(shade(base, 0.12)));
    body.addColorStop(1, rgb(shade(base, -0.18)));
    ctx.fillStyle = body;
    roundRect(ctx, x, y, width, height, r);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = Math.max(1, height * 0.03);
    roundRect(ctx, x + 0.5, y + 0.5, width - 1, height - 1, r);
    ctx.stroke();

    // Dark digits in the tile's own hue: high contrast on every colour, one size per row.
    const size = fontSize ?? binLabelSize([label], width, height, fontFamily);
    ctx.font = `800 ${size}px ${fontFamily}`;
    const text = binLabel(label); // never "×": every bin reads the same
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgb(shade(color, -0.82));
    ctx.fillText(text, x + width / 2, y + height * 0.53);
    return canvas;
  };
  return { normal: draw(false), lit: draw(true), pad };
}
