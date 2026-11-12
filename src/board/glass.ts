/**
 * The minimalist cabinet, drawn as vectors instead of a bitmap so its thin neon edge stays
 * sharp on any screen: a smoked-glass triangle with one neon line, orange on the left and
 * blue on the right, and a glass tray under it for the bins. Proportions follow the concept
 * art in `art/cabinet-minimal.png` (fractions of the cabinet rect, see MINIMAL_LAYOUT).
 */

const ORANGE = [255, 138, 42] as const;
const BLUE = [61, 139, 255] as const;

/** Neon line through the triangle's corners and the tray, as fractions of the cabinet rect. */
export const GLASS_SHAPE = {
  apex: [0.5, 0.0477],
  baseY: 0.8727,
  baseLeft: 0.0498,
  baseRight: 0.9502,
  tray: { left: 0.0384, right: 0.9616, top: 0.8727, bottom: 0.9568, radius: 0.012 },
} as const;

const rgba = (c: readonly number[], a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function drawGlassTriangle(ctx: CanvasRenderingContext2D, cab: Rect): void {
  const px = (fx: number) => cab.x + fx * cab.w;
  const py = (fy: number) => cab.y + fy * cab.h;
  const s = GLASS_SHAPE;
  const apex: [number, number] = [px(s.apex[0]), py(s.apex[1])];
  const left: [number, number] = [px(s.baseLeft), py(s.baseY)];
  const right: [number, number] = [px(s.baseRight), py(s.baseY)];
  const t = s.tray;
  const tray = {
    x: px(t.left),
    y: py(t.top),
    w: (t.right - t.left) * cab.w,
    h: (t.bottom - t.top) * cab.h,
    r: t.radius * cab.w,
  };
  // Line weight follows the board's size: about 1.4 px on a phone, 3 px on a laptop.
  const line = Math.max(1.2, cab.w * 0.0036);

  // The tray's line: orange on the left, blue on the right.
  const edge = ctx.createLinearGradient(left[0], 0, right[0], 0);
  edge.addColorStop(0, rgba(ORANGE, 1));
  edge.addColorStop(0.4, rgba(ORANGE, 1));
  edge.addColorStop(0.6, rgba(BLUE, 1));
  edge.addColorStop(1, rgba(BLUE, 1));

  const triangle = () => {
    ctx.beginPath();
    ctx.moveTo(...apex);
    ctx.lineTo(...right);
    ctx.lineTo(...left);
    ctx.closePath();
  };
  const trayPath = () => {
    ctx.beginPath();
    ctx.roundRect(tray.x, tray.y, tray.w, tray.h, tray.r);
  };

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Smoked glass plate: near-black, a touch lighter at the top.
  triangle();
  const plate = ctx.createLinearGradient(0, apex[1], 0, left[1]);
  plate.addColorStop(0, 'rgba(18, 19, 26, 0.94)');
  plate.addColorStop(1, 'rgba(6, 7, 11, 0.96)');
  ctx.fillStyle = plate;
  ctx.fill();

  // Glass facet: the left half of the plate catches the light, brightest at the apex.
  ctx.save();
  triangle();
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(...apex);
  ctx.lineTo(apex[0], left[1]);
  ctx.lineTo(...left);
  ctx.closePath();
  const facet = ctx.createLinearGradient(0, apex[1], 0, left[1]);
  facet.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
  facet.addColorStop(0.45, 'rgba(255, 255, 255, 0.05)');
  facet.addColorStop(1, 'rgba(255, 255, 255, 0.01)');
  ctx.fillStyle = facet;
  ctx.fill();
  ctx.restore();

  // Glass tray for the bins.
  trayPath();
  const trayFill = ctx.createLinearGradient(0, tray.y, 0, tray.y + tray.h);
  trayFill.addColorStop(0, 'rgba(14, 15, 21, 0.92)');
  trayFill.addColorStop(1, 'rgba(6, 7, 11, 0.95)');
  ctx.fillStyle = trayFill;
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(
    tray.x + line * 3,
    tray.y + line * 3,
    tray.w - line * 6,
    tray.h - line * 6,
    Math.max(0, tray.r - line * 2),
  );
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Neon: each side keeps its own colour up to the apex; the tray runs orange to blue.
  const leftSide = () => {
    ctx.beginPath();
    ctx.moveTo(...left);
    ctx.lineTo(...apex);
  };
  const rightSide = () => {
    ctx.beginPath();
    ctx.moveTo(...apex);
    ctx.lineTo(...right);
  };
  const tube = (
    path: () => void,
    color: string | CanvasGradient,
    core: string | CanvasGradient,
    strength = 1,
  ) => {
    // wide haze, soft glow, coloured tube, then a thin light core: crisp like real neon
    for (const [width, blur, alpha, style] of [
      [line * 9, line * 8, 0.4 * strength, color],
      [line * 3.5, line * 2.5, 0.6 * strength, color],
      [line * 1.6, 0, strength, color],
      [line * 0.6, 0, strength, core],
    ] as const) {
      path();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.filter = blur > 0 ? `blur(${blur}px)` : 'none';
      ctx.stroke();
    }
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  };
  const trayCore = ctx.createLinearGradient(left[0], 0, right[0], 0);
  trayCore.addColorStop(0.4, 'rgba(255, 214, 160, 1)');
  trayCore.addColorStop(0.6, 'rgba(178, 212, 255, 1)');
  tube(trayPath, edge, trayCore, 0.85);
  tube(leftSide, rgba(ORANGE, 1), 'rgba(255, 214, 160, 1)');
  tube(rightSide, rgba(BLUE, 1), 'rgba(178, 212, 255, 1)');
  // A small hot tip where the two colours meet.
  const r = line * 2.4;
  const tip = ctx.createRadialGradient(apex[0], apex[1], 0, apex[0], apex[1], r);
  tip.addColorStop(0, 'rgba(255, 252, 248, 0.9)');
  tip.addColorStop(1, 'rgba(255, 252, 248, 0)');
  ctx.fillStyle = tip;
  ctx.fillRect(apex[0] - r, apex[1] - r, r * 2, r * 2);
  ctx.restore();
}
