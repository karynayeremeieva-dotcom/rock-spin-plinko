/** Board colours and pre-rendered sprites. Drawing gradients once, then blitting, keeps 50 balls cheap. */

export const BOARD_COLORS = {
  peg: { rim: '#2a2c31', base: '#8a9099', light: '#f3f5f8' },
  pegGlow: 'rgba(255, 140, 40, 1)',
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
  const size = radius * 2 + 2;
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
export const BALL_SPRITE_SCALE = 2.5;

export function ballSprite(ballRadius: number): HTMLCanvasElement {
  const r = ballRadius * BALL_SPRITE_SCALE;
  const { canvas, ctx } = makeCanvas(r * 2, r * 2);
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  const [c0, c1, c2, c3, c4] = BOARD_COLORS.ball;
  const core = 1 / BALL_SPRITE_SCALE;
  g.addColorStop(0, c0);
  g.addColorStop(core * 0.45, c1);
  g.addColorStop(core * 0.9, c2);
  g.addColorStop(core * 1.15, c3);
  g.addColorStop(1, c4);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, r * 2, r * 2);
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
export function binSprites(
  width: number,
  height: number,
  color: Rgb,
  label: number,
  fontFamily: string,
): BinSpriteSet {
  const pad = Math.ceil(height * 0.5);
  const draw = (lit: boolean) => {
    const { canvas, ctx } = makeCanvas(width + pad * 2, height + pad * 2);
    const x = pad;
    const y = pad;
    const r = Math.min(width, height) * 0.2;
    const base = lit ? shade(color, 0.35) : color;

    if (lit) {
      ctx.shadowColor = rgb(color, 0.95);
      ctx.shadowBlur = pad * 0.9;
    }
    const fill = ctx.createLinearGradient(0, y, 0, y + height);
    fill.addColorStop(0, rgb(shade(base, 0.25)));
    fill.addColorStop(0.55, rgb(base));
    fill.addColorStop(1, rgb(shade(base, -0.35)));
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, width, height, r);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Grille cloth: a dot weave clipped to the cabinet.
    ctx.save();
    roundRect(ctx, x, y, width, height, r);
    ctx.clip();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    const step = Math.max(2, Math.round(height / 11));
    for (let gy = y + step / 2; gy < y + height; gy += step) {
      const offset = Math.round((gy - y) / step) % 2 === 0 ? 0 : step / 2;
      for (let gx = x + offset; gx < x + width; gx += step) {
        ctx.fillRect(gx, gy, step * 0.45, step * 0.45);
      }
    }
    // Top bevel.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(x, y, width, Math.max(1, height * 0.06));
    ctx.restore();

    // Label: with "×" if it fits, without otherwise.
    let size = Math.min(height * 0.42, width * 0.42);
    ctx.font = `800 ${size}px ${fontFamily}`;
    let text = formatMultiplier(label, true);
    if (ctx.measureText(text).width > width * 0.86) text = formatMultiplier(label, false);
    while (ctx.measureText(text).width > width * 0.9 && size > 4) {
      size -= 0.5;
      ctx.font = `800 ${size}px ${fontFamily}`;
    }
    ctx.fillStyle = BOARD_COLORS.binText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + width / 2, y + height * 0.54);
    return canvas;
  };
  return { normal: draw(false), lit: draw(true), pad };
}
