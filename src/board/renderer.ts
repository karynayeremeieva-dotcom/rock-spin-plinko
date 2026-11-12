/**
 * Canvas 2D board. Draws pegs, balls and bins; plays each ball along its trajectory and
 * reports when it lands. Owns no game state: money is handled by the engine.
 *
 * Theme: every row of pegs is a guitar string clamped by the pegs. A hit plucks the string:
 * the segments between pegs vibrate (pegs stay nodes), strongest near the hit, and decay.
 *
 * Performance:
 * - pegs are drawn once into an offscreen layer; balls, glows and bins are pre-rendered sprites;
 * - the render loop runs only while something moves, and stops when the board is idle;
 * - its own clock advances by at most 50 ms per frame, so a hidden tab (no rAF) simply
 *   pauses the flight and balls continue from the same spot when the tab comes back.
 */
import type { Direction } from '../core/rng';
import type { Skin } from '../core/storage';
import { CABINET_HAS_NEON, CABINETS, type CabinetLayout } from './cabinet';
import { drawGlassTriangle } from './glass';
import {
  NEON_GAP,
  NEON_MARGIN,
  binCenterX,
  computeCabinetGeometry,
  computeGeometry,
  pegCount,
  pegX,
  pegY,
  type BoardGeometry,
} from './geometry';
import {
  BALL_SPRITE_SCALE,
  BOARD_COLORS,
  ballSprite,
  binColor,
  binLabelSize,
  binSprites,
  neonBinSprites,
  neonPegSprite,
  glowSprite,
  pegSprite,
  type BinSpriteSet,
} from './theme';
import { buildTrajectory, type Trajectory } from './trajectory';
import { NEON_SCHEMES, resample, roundCorners, type NeonScheme } from './neon';

export interface RendererCallbacks {
  onLand: (id: string, bin: number) => void;
  onPegHit?: (row: number) => void;
}

export interface RendererOptions {
  reducedMotion?: boolean;
  fontFamily?: string;
  /** Board design; see setSkin. */
  skin?: Skin;
}

interface LiveBall {
  id: string;
  trajectory: Trajectory;
  /** Geometry the trajectory was built for; positions are mapped if the board resizes. */
  geometry: BoardGeometry;
  t: number;
  nextHit: number;
}

const MAX_DT = 0.05;
const PEG_FLASH = 0.22;
const BIN_BOUNCE = 0.32;
const BIN_FLASH = 0.45;
const TRAIL = 0; // a trail smears the ball; the plucked strings already show motion
const MAX_DPR = 2;
/** Narrow face for bin labels when the bins are small (loaded by the app's CSS). */
const CONDENSED_FONT = "'Oswald Variable', 'Arial Narrow', sans-serif";
const SHOW_PEG_FLASH = false;
/** String vibration: decay time constant (s) and visual frequency (Hz). */
const STRING_DECAY = 0.32;
const STRING_HZ = 7.5;

export class BoardRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly callbacks: RendererCallbacks;
  private reducedMotion: boolean;
  private readonly fontFamily: string;

  private width = 0;
  private height = 0;
  private dpr = 1;
  private rows = 16;
  private table: readonly number[] = [];
  private geometry: BoardGeometry | null = null;

  private pegLayer: HTMLCanvasElement | null = null;
  /** Soft dark plate behind the pyramid so the board reads over a busy stage. */
  private backplate: HTMLCanvasElement | null = null;
  /** Machine cabinet art; the board is laid out inside it once the image has loaded. */
  private cabinetImg: HTMLImageElement | null = null;
  /** Cabinet art (or the vector cabinet) is ready: lay the board out inside it. */
  private cabinetReady = false;
  private cabinetLayer: HTMLCanvasElement | null = null;
  private skin: Skin = 'guitar';
  private cabinetLayout: CabinetLayout = CABINETS.guitar.layout;
  /** Minimalist design: glowing pegs without strings, glass bins, coloured peg flashes. */
  private neon = false;
  private pegGlowB: HTMLCanvasElement | null = null;
  /** Peg index range per row of the play pyramid (strings run across it). */
  private pegRange: [number, number][] = [];
  private neonScheme: NeonScheme = 'cool';
  private pegImg: HTMLCanvasElement | null = null;
  private pegGlowImg: HTMLCanvasElement | null = null;
  private ballImg: HTMLCanvasElement | null = null;
  private bins: BinSpriteSet[] = [];

  private balls: LiveBall[] = [];
  /** row * 32 + peg → time of last hit. */
  private readonly pegFlash = new Map<number, number>();
  private binHit: number[] = [];
  /** Per-row string amplitude (px) and x of the last pluck. */
  private stringAmp = new Float32Array(0);
  private stringHitX = new Float32Array(0);
  private transitionStart = -Infinity;

  private time = 0;
  private raf = 0;
  private lastFrame = 0;
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    callbacks: RendererCallbacks,
    {
      reducedMotion = false,
      fontFamily = 'system-ui, sans-serif',
      skin = 'guitar',
    }: RendererOptions = {},
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.callbacks = callbacks;
    // Bin digits use the condensed display face: redraw once it has loaded.
    if (typeof document !== 'undefined' && document.fonts) {
      void document.fonts
        .load("700 16px 'Oswald Variable'")
        .then(() => !this.destroyed && this.rebuild(false));
    }
    this.loadCabinet(skin);
    this.reducedMotion = reducedMotion;
    this.fontFamily = fontFamily;
  }

  // ---------- public API ----------

  get ballCount(): number {
    return this.balls.length;
  }

  getGeometry(): BoardGeometry | null {
    return this.geometry;
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    const dpr = Math.min(MAX_DPR, Math.max(1, devicePixelRatio));
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.rebuild(false);
  }

  /** New row count or multiplier table. Animates the pegs in when rows change. */
  setLayout(rows: number, table: readonly number[]): void {
    if (table.length !== rows + 1) throw new Error('Table does not match rows');
    const rowsChanged = rows !== this.rows;
    const tableChanged = table.join() !== this.table.join();
    if (!rowsChanged && !tableChanged) return;
    if (rowsChanged) this.landAll(); // trajectories belong to the old board
    this.rows = rows;
    this.table = table;
    this.binHit = new Array<number>(rows + 1).fill(-Infinity);
    this.stringAmp = new Float32Array(rows);
    this.stringHitX = new Float32Array(rows);
    this.rebuild(rowsChanged);
  }

  addBall(id: string, path: readonly Direction[]): void {
    const geometry = this.geometry;
    if (!geometry || path.length !== geometry.rows) {
      // Board not ready or out of sync: settle immediately rather than lose the ball.
      this.callbacks.onLand(
        id,
        path.reduce<number>((a, b) => a + b, 0),
      );
      return;
    }
    const trajectory = buildTrajectory(geometry, path);
    this.balls.push({ id, trajectory, geometry, t: 0, nextHit: 0 });
    this.wake();
  }

  /** Switches the neon colours inside the cabinet. */
  /** Swaps the cabinet art (board design); the board is laid out again once it loads. */
  setSkin(skin: Skin): void {
    if (skin === this.skin) return;
    this.loadCabinet(skin);
  }

  private loadCabinet(skin: Skin): void {
    this.skin = skin;
    if (typeof Image === 'undefined') return;
    const { url, layout } = CABINETS[skin];
    const apply = (img: HTMLImageElement | null) => {
      this.cabinetImg = img;
      this.cabinetLayout = layout;
      this.neon = skin === 'minimal';
      this.cabinetReady = true;
      this.rebuild(false);
    };
    if (!url) {
      apply(null);
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (this.destroyed || this.skin !== skin) return;
      apply(img);
    };
    img.src = url;
  }

  setNeonScheme(scheme: NeonScheme): void {
    if (scheme === this.neonScheme) return;
    this.neonScheme = scheme;
    this.rebuild(false);
  }

  /** Re-renders sprites, e.g. after the web font has loaded. */
  refresh(): void {
    this.rebuild(false);
  }

  /** Finishes every ball right now (board torn down or rebuilt). */
  landAll(): void {
    const balls = this.balls;
    this.balls = [];
    for (const ball of balls) this.callbacks.onLand(ball.id, ball.trajectory.bin);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  // ---------- setup ----------

  private rebuild(animate: boolean): void {
    if (this.width <= 0 || this.height <= 0 || this.table.length !== this.rows + 1) return;
    let g: BoardGeometry;
    this.cabinetLayer = null;
    if (this.cabinetReady) {
      const fit = computeCabinetGeometry(this.width, this.height, this.rows, this.cabinetLayout);
      g = fit.geometry;
      this.cabinetLayer = this.buildCabinetLayer(fit.cabinet, g, fit.field);
    } else {
      g = computeGeometry(this.width, this.height, this.rows);
    }
    this.pegRange = Array.from({ length: g.rows }, (_, row) => [0, pegCount(row) - 1]);
    this.geometry = g;
    const d = this.dpr;

    this.pegImg = this.neon ? neonPegSprite(g.pegRadius * d) : pegSprite(g.pegRadius * d);
    this.pegGlowImg = glowSprite(
      g.pegRadius * 4 * d,
      this.neon ? 'rgba(255, 150, 60, 1)' : BOARD_COLORS.pegGlow,
    );
    this.pegGlowB = this.neon ? glowSprite(g.pegRadius * 4 * d, 'rgba(80, 150, 255, 1)') : null;
    this.ballImg = ballSprite(g.ballRadius * d);
    // Narrow bins (phones, many rows) switch to a condensed face, so full labels like 0.2 and
    // 1000 keep digits big enough to read.
    let binFont = this.fontFamily;
    let labelSize = binLabelSize(this.table, g.binWidth * d, g.binHeight * d, binFont);
    if (labelSize < 12 * d) {
      binFont = CONDENSED_FONT;
      labelSize = binLabelSize(this.table, g.binWidth * d, g.binHeight * d, binFont);
    }
    const makeBin = this.neon ? neonBinSprites : binSprites;
    this.bins = this.table.map((m, k) =>
      makeBin(
        g.binWidth * d,
        g.binHeight * d,
        binColor(Math.abs(k - g.rows / 2) / (g.rows / 2)),
        m,
        binFont,
        labelSize,
      ),
    );

    const layer = document.createElement('canvas');
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const lctx = layer.getContext('2d');
    if (lctx) {
      lctx.setTransform(d, 0, 0, d, 0, 0);
      for (let row = 0; row < g.rows; row++) this.drawRowPegs(lctx, g, row, 1);
    }
    this.pegLayer = layer;
    // The cabinet's own dark playfield replaces the soft backplate.
    this.backplate = this.cabinetLayer ? null : this.buildBackplate(g);

    if (animate && !this.reducedMotion) this.transitionStart = this.time;
    this.wake();
  }

  // ---------- loop ----------

  private wake(): void {
    if (this.destroyed) return;
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    this.raf = 0;
    if (this.destroyed) return;
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, MAX_DT) : 1 / 60;
    this.lastFrame = now;
    this.time += dt;
    this.step(dt);
    this.draw();
    if (this.isAnimating()) this.raf = requestAnimationFrame(this.frame);
    else this.lastFrame = 0;
  };

  private step(dt: number): void {
    const decay = Math.exp(-dt / STRING_DECAY);
    for (let r = 0; r < this.stringAmp.length; r++) {
      const a = (this.stringAmp[r] ?? 0) * decay;
      this.stringAmp[r] = a < 0.05 ? 0 : a;
    }
    const landed: LiveBall[] = [];
    let write = 0;
    for (const ball of this.balls) {
      ball.t += dt;
      const { hits, pegs } = ball.trajectory;
      while (ball.nextHit < hits.length && ball.t >= (hits[ball.nextHit] ?? Infinity)) {
        const row = ball.nextHit;
        this.pegFlash.set(row * 32 + (pegs[row] ?? 0), this.time);
        this.pluck(row, pegs[row] ?? 0);
        this.callbacks.onPegHit?.(row);
        ball.nextHit++;
      }
      if (ball.t >= ball.trajectory.duration) landed.push(ball);
      else this.balls[write++] = ball;
    }
    this.balls.length = write;
    for (const ball of landed) {
      this.binHit[ball.trajectory.bin] = this.time;
      this.callbacks.onLand(ball.id, ball.trajectory.bin);
    }
  }

  private pluck(row: number, peg: number): void {
    const g = this.geometry;
    if (!g || this.neon || this.reducedMotion || row >= this.stringAmp.length) return;
    const max = g.rowGap * 0.2;
    this.stringAmp[row] = Math.min(max, (this.stringAmp[row] ?? 0) + g.rowGap * 0.11);
    this.stringHitX[row] = pegX(g, row, peg);
  }

  private isAnimating(): boolean {
    if (this.balls.length > 0) return true;
    for (const a of this.stringAmp) if (a > 0) return true;
    if (this.time - this.transitionStart < this.transitionDuration()) return true;
    for (const t of this.binHit) if (this.time - t < BIN_FLASH) return true;
    for (const t of this.pegFlash.values()) if (this.time - t < PEG_FLASH) return true;
    return false;
  }

  private transitionDuration(): number {
    return 0.016 * this.rows + 0.26;
  }

  // ---------- drawing ----------

  private draw(): void {
    const g = this.geometry;
    const { ctx } = this;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!g) return;
    ctx.setTransform(d, 0, 0, d, 0, 0);

    const sinceTransition = this.time - this.transitionStart;
    const transitioning = sinceTransition < this.transitionDuration();

    const under = this.cabinetLayer ?? this.backplate;
    if (under) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(under, 0, 0);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }

    if (!this.neon) this.drawStrings(g, transitioning ? sinceTransition : Infinity);

    // Pegs.
    if (transitioning) {
      for (let row = 0; row < g.rows; row++) {
        const scale = popIn((sinceTransition - row * 0.016) / 0.22);
        if (scale <= 0) continue;
        this.drawRowPegs(ctx, g, row, scale);
      }
    } else if (this.pegLayer) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.pegLayer, 0, 0);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }

    // Peg flashes: off — the plucked string already marks the hit, a glow blob looked dirty.
    if ((SHOW_PEG_FLASH || this.neon) && this.pegGlowImg && this.pegFlash.size > 0) {
      const warm = this.pegGlowImg;
      const cool = this.pegGlowB ?? warm;
      const size = g.pegRadius * 8;
      ctx.globalCompositeOperation = 'lighter';
      for (const [key, t] of this.pegFlash) {
        const age = this.time - t;
        if (age >= PEG_FLASH) {
          this.pegFlash.delete(key);
          continue;
        }
        const row = Math.floor(key / 32);
        const x = pegX(g, row, key % 32);
        const y = pegY(g, row);
        ctx.globalAlpha = 1 - age / PEG_FLASH;
        // Neon: the flash takes the colour of its side of the triangle.
        const glow = x < g.centerX ? warm : cool;
        ctx.drawImage(glow, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    this.drawBins(g, transitioning ? popIn((sinceTransition - g.rows * 0.016) / 0.22) : 1);
    this.drawBalls(g);
  }

  /** Cabinet art plus the neon tubes inside its playfield, pre-rendered once per layout. */
  private buildCabinetLayer(
    rect: { x: number; y: number; w: number; h: number },
    g: BoardGeometry,
    field: {
      top: number;
      bottom: number;
      channelTop?: number;
      channelBottom?: number;
      edgesAt?: (y: number) => [number, number];
    },
  ) {
    const img = this.cabinetImg;
    if (!img && !this.neon) return null;
    const layer = document.createElement('canvas');
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const lctx = layer.getContext('2d');
    if (!lctx) return null;
    const d = this.dpr;
    lctx.imageSmoothingQuality = 'high';
    if (img) lctx.drawImage(img, rect.x * d, rect.y * d, rect.w * d, rect.h * d);
    lctx.setTransform(d, 0, 0, d, 0, 0);
    if (!img) drawGlassTriangle(lctx, rect);
    this.drawNeon(lctx, g, field, rect);
    return layer;
  }

  /**
   * Neon inside the playfield, after the concept art. Two parallel tubes in neighbouring
   * hues: a stepped chute around the spawn point, then a diagonal along the pyramid's
   * flank down to the shelf. Wings branch off the diagonal towards the cabinet walls and end
   * in glowing rings; channels on the bin edges alternate the two colours. Every tube has
   * rounded corners and swells smoothly in the middle.
   */
  private drawNeon(
    ctx: CanvasRenderingContext2D,
    g: BoardGeometry,
    field: { top: number; bottom: number; channelTop?: number; channelBottom?: number },
    cab: { x: number; y: number; w: number; h: number },
  ): void {
    type Pt = [number, number];
    const s = g.spacing;
    const rows = g.rows;
    const { a: colorA, b: colorB } = NEON_SCHEMES[this.neonScheme];
    const cx = g.centerX;
    const rowY = (r: number) => pegY(g, r);
    const lastRow = rows - 1;
    const chuteRows = Math.max(2, Math.round(rows * 0.3));
    const stepRow = Math.max(1, Math.round(chuteRows / 2) - 1);
    const { field: f } = this.cabinetLayout;
    const fieldLeftAt = (y: number) => {
      const t = (y - (cab.y + f.top * cab.h)) / ((f.bottom - f.top) * cab.h);
      return cab.x + (f.leftTop + (f.leftBottom - f.leftTop) * t) * cab.w;
    };

    /** Left half of a tube at `margin` from the outermost pegs, roof at `roofY`. */
    const tubePath = (margin: number, roofY: number): Pt[] => {
      const x1 = pegX(g, stepRow, 0) - margin;
      const x2 = pegX(g, chuteRows, 0) - margin;
      const yStep = rowY(stepRow) + g.rowGap * 0.5;
      const ch = Math.min(g.rowGap * 0.4, (x1 - x2) / 2);
      return [
        [cx, roofY],
        [x1, roofY],
        [x1, yStep - ch],
        [x2, yStep + ch],
        [x2, rowY(chuteRows)],
        [pegX(g, lastRow, 0) - margin, rowY(lastRow) + g.rowGap * 0.5],
        [pegX(g, lastRow, 0) - margin, field.bottom],
      ];
    };

    const roofY = g.spawnY - s * 0.4;
    const inner = roundCorners(tubePath(s * NEON_MARGIN, roofY), s * 0.6);
    const outer = roundCorners(
      tubePath(s * (NEON_MARGIN + NEON_GAP), roofY - s * NEON_GAP),
      s * 0.75,
    );
    const mirror = (pts: Pt[]) => pts.map(([x, y]) => [2 * cx - x, y] as Pt);

    /** Glow pass along the whole path, then a core whose width swells smoothly. */
    const tube = (pts: Pt[], color: string, wMin: number, wMax: number) => {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.shadowColor = color;
      ctx.shadowBlur = Math.max(5, s * 0.55) * this.dpr;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = (wMin + wMax) / 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      // Body and hot core as filled ribbons: one smooth outline, width swelling mid-way.
      const pieces = resample(pts, Math.max(1.5, s * 0.12));
      const widthAt = (t: number) => wMin + (wMax - wMin) * Math.sin(Math.PI * t);
      ribbon(pieces, widthAt, color);
      ribbon(pieces, (t) => Math.max(0.5, widthAt(t) * 0.32), 'rgba(255, 255, 255, 0.75)');
      ctx.restore();
    };

    /** Fills a band of width w(t) around the resampled centre line. */
    const ribbon = (
      pieces: { p: Pt; t: number }[],
      widthAt: (t: number) => number,
      color: string,
    ) => {
      if (pieces.length < 2) return;
      const leftSide: Pt[] = [];
      const rightSide: Pt[] = [];
      pieces.forEach(({ p, t }, i) => {
        const prev = pieces[Math.max(0, i - 1)]?.p ?? p;
        const next = pieces[Math.min(pieces.length - 1, i + 1)]?.p ?? p;
        const dx = next[0] - prev[0];
        const dy = next[1] - prev[1];
        const len = Math.hypot(dx, dy) || 1;
        const half = widthAt(t) / 2;
        const nx = (-dy / len) * half;
        const ny = (dx / len) * half;
        leftSide.push([p[0] + nx, p[1] + ny]);
        rightSide.push([p[0] - nx, p[1] - ny]);
      });
      ctx.beginPath();
      [...leftSide, ...rightSide.reverse()].forEach(([x, y], i) =>
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
      );
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };

    const ring = ([x, y]: Pt, color: string) => {
      const r = s * 0.32;
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = Math.max(6, s * 0.7) * this.dpr;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.4, s * 0.09);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      const chrome = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.05, x, y, r * 0.7);
      chrome.addColorStop(0, '#ffffff');
      chrome.addColorStop(0.5, '#9aa0a8');
      chrome.addColorStop(1, '#2a2c31');
      ctx.fillStyle = chrome;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const w = Math.max(1.3, s * 0.1);
    if (CABINET_HAS_NEON) {
      if (!this.neon) drawChannels();
      return;
    }
    tube(outer, colorB, w * 0.45, w * 0.95);
    tube(mirror(outer), colorB, w * 0.45, w * 0.95);
    tube(inner, colorA, w * 0.5, w * 1.25);
    tube(mirror(inner), colorA, w * 0.5, w * 1.25);

    // Wings: from the flank diagonal up and out to the cabinet wall, ending in a ring.
    const diagTop: Pt = [pegX(g, chuteRows, 0) - s * (NEON_MARGIN + NEON_GAP), rowY(chuteRows)];
    const diagBottom: Pt = [
      pegX(g, lastRow, 0) - s * (NEON_MARGIN + NEON_GAP),
      rowY(lastRow) + g.rowGap * 0.5,
    ];
    for (const t of [0.3, 0.68]) {
      const start: Pt = [
        diagTop[0] + (diagBottom[0] - diagTop[0]) * t,
        diagTop[1] + (diagBottom[1] - diagTop[1]) * t,
      ];
      // walk up-left at a shallow angle until just short of the wall
      let end: Pt = start;
      for (let k = 1; k < 400; k++) {
        const p: Pt = [start[0] - k, start[1] - k * 0.55];
        if (p[0] < fieldLeftAt(p[1]) + s * 0.55 || p[1] < field.top + s * 0.6) break;
        end = p;
      }
      if (start[0] - end[0] < s * 0.7) continue; // no room on narrow boards
      const wing = roundCorners([start, end], 0);
      tube(wing, colorB, w * 0.35, w * 0.8);
      tube(mirror(wing), colorB, w * 0.35, w * 0.8);
      ring(end, colorB);
      ring([2 * cx - end[0], end[1]], colorB);
    }

    drawChannels();

    function drawChannels() {
      // Dividers into the bins: brushed steel pins in the gap under the plate's bottom edge,
      // like the cabinet's metal, so the only neon is the cabinet's own.
      const top = field.channelTop ?? rowY(lastRow) + g.rowGap * 0.6;
      const bottom = field.channelBottom ?? field.bottom;
      const pinW = Math.max(1.2, Math.min(2.2, s * 0.085));
      const len = bottom - top;
      for (let k = 1; k <= rows; k++) {
        const x = binCenterX(g, k) - s / 2;
        // soft contact shadow on the floor
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.roundRect(x - pinW * 0.5 + pinW * 0.6, top + pinW * 0.6, pinW * 1.3, len, pinW);
        ctx.fill();
        // the pin: dark edges, a bright highlight on the left, like a chrome rod lit from the top-left
        const body = ctx.createLinearGradient(x - pinW / 2, 0, x + pinW / 2, 0);
        body.addColorStop(0, '#3a3d43');
        body.addColorStop(0.3, '#e4e7ec');
        body.addColorStop(0.55, '#8d929b');
        body.addColorStop(1, '#2b2e33');
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.roundRect(x - pinW / 2, top, pinW, len, pinW / 2);
        ctx.fill();
        // a faint glint at the top cap
        const cap = ctx.createRadialGradient(
          x - pinW * 0.15,
          top + pinW * 0.5,
          0,
          x,
          top + pinW * 0.5,
          pinW,
        );
        cap.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
        cap.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = cap;
        ctx.beginPath();
        ctx.arc(x, top + pinW * 0.5, pinW, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * Dark plate shaped like the pyramid, with soft edges. Built once per layout.
   * The blur comes from a shadow of a shape drawn off-canvas, which every browser supports
   * (canvas `filter` is missing on older Safari).
   */
  private buildBackplate(g: BoardGeometry): HTMLCanvasElement | null {
    const plate = document.createElement('canvas');
    plate.width = this.canvas.width;
    plate.height = this.canvas.height;
    const pctx = plate.getContext('2d');
    if (!pctx) return null;
    const d = this.dpr;
    const pad = g.spacing * 0.9;
    const topY = g.spawnY + g.spacing * 0.2;
    const bottomY = g.binTop + g.binHeight + g.spacing * 0.35;
    const topHalf = g.spacing * 2.2;
    const bottomHalf = ((g.rows + 1) / 2) * g.spacing + pad;
    const off = 100_000; // draw far off-canvas, keep only the blurred shadow
    pctx.setTransform(d, 0, 0, d, -off * d, 0);
    pctx.shadowOffsetX = off * d;
    pctx.shadowBlur = g.spacing * 1.4 * d;
    pctx.shadowColor = BOARD_COLORS.backplate;
    pctx.fillStyle = '#000';
    pctx.beginPath();
    pctx.moveTo(g.centerX - topHalf, topY);
    pctx.lineTo(g.centerX + topHalf, topY);
    pctx.lineTo(g.centerX + bottomHalf, bottomY);
    pctx.lineTo(g.centerX - bottomHalf, bottomY);
    pctx.closePath();
    pctx.fill();
    return plate;
  }

  /** String span for a row: anchors sit just outside the first and last peg. */
  private stringSpan(g: BoardGeometry, row: number) {
    const [from, to] = this.pegRange[row] ?? [0, pegCount(row) - 1];
    const first = pegX(g, row, from);
    const last = pegX(g, row, to);
    // The string ends on the outer pegs; nothing hangs past them.
    return { first, last, left: first, right: last };
  }

  private stringWidth(g: BoardGeometry, row: number): number {
    // Lower strings are thicker, like wound bass strings.
    const scale = Math.min(1.4, Math.max(0.7, g.spacing / 24));
    return (0.8 + (1.4 * row) / Math.max(1, g.rows - 1)) * scale;
  }

  private drawStrings(g: BoardGeometry, sinceTransition: number): void {
    const { ctx } = this;
    const phase = Math.cos(this.time * Math.PI * 2 * STRING_HZ);
    const max = g.rowGap * 0.2;
    ctx.lineCap = 'round';
    for (let row = 0; row < g.rows; row++) {
      const appear =
        sinceTransition === Infinity ? 1 : popIn((sinceTransition - row * 0.016) / 0.22);
      if (appear <= 0) continue;
      const y = pegY(g, row);
      const { first, last, left, right } = this.stringSpan(g, row);
      const amp = (this.stringAmp[row] ?? 0) * phase;
      const hitX = this.stringHitX[row] ?? 0;

      ctx.beginPath();
      ctx.moveTo(left, y);
      if (amp === 0) {
        ctx.lineTo(right, y);
      } else {
        ctx.lineTo(first, y);
        const step = g.spacing / 8;
        for (let x = first + step; x < last; x += step) {
          const near = Math.exp(-Math.abs(x - hitX) / (g.spacing * 2.2));
          // Pegs are nodes: sin(π·(x − first)/spacing) is 0 at every peg.
          ctx.lineTo(x, y + amp * near * Math.sin((Math.PI * (x - first)) / g.spacing));
        }
        ctx.lineTo(last, y);
        ctx.lineTo(right, y);
      }
      const width = this.stringWidth(g, row);
      ctx.globalAlpha = 0.85 * Math.min(1, appear);
      // Steel string: darker body and a thin highlight along the top, like a real wound string.
      ctx.strokeStyle = BOARD_COLORS.stringBody;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.save();
      ctx.translate(0, -width * 0.22);
      ctx.strokeStyle = BOARD_COLORS.string;
      ctx.lineWidth = Math.max(0.5, width * 0.4);
      ctx.stroke();
      ctx.restore();

      const energy = (this.stringAmp[row] ?? 0) / max;
      if (energy > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, energy) * 0.7;
        ctx.strokeStyle = BOARD_COLORS.stringHot;
        ctx.lineWidth = width + 1.6;
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawRowPegs(
    ctx: CanvasRenderingContext2D,
    g: BoardGeometry,
    row: number,
    scale: number,
  ): void {
    for (let i = 0; i < pegCount(row); i++) this.drawPeg(ctx, g, row, i, scale);
  }

  private drawPeg(
    ctx: CanvasRenderingContext2D,
    g: BoardGeometry,
    row: number,
    index: number,
    scale: number,
  ): void {
    const img = this.pegImg;
    if (!img) return;
    const d = this.dpr;
    // Snapped to device pixels and drawn at the sprite's own size, so all pegs look identical
    // (fractional positions made some of them softer and seemingly bigger).
    const side = img.width / d;
    if (scale === 1) {
      const x = Math.round(pegX(g, row, index) * d - img.width / 2) / d;
      const y = Math.round(pegY(g, row) * d - img.height / 2) / d;
      ctx.drawImage(img, x, y, side, side);
      return;
    }
    const size = side * scale;
    ctx.drawImage(img, pegX(g, row, index) - size / 2, pegY(g, row) - size / 2, size, size);
  }

  private drawBins(g: BoardGeometry, scale: number): void {
    if (scale <= 0) return;
    const { ctx } = this;
    for (let k = 0; k < this.bins.length; k++) {
      const sprite = this.bins[k];
      if (!sprite) continue;
      const age = this.time - (this.binHit[k] ?? -Infinity);
      const bounce =
        !this.reducedMotion && age < BIN_BOUNCE
          ? Math.sin((age / BIN_BOUNCE) * Math.PI) * g.binHeight * 0.22 * (1 - age / BIN_BOUNCE)
          : 0;
      const pad = sprite.pad / this.dpr;
      const w = (g.binWidth + pad * 2) * scale;
      const h = (g.binHeight + pad * 2) * scale;
      const cx = g.centerX + (k - g.rows / 2) * g.spacing;
      const cy = g.binTop + g.binHeight / 2 + bounce;
      ctx.drawImage(sprite.normal, cx - w / 2, cy - h / 2, w, h);
      if (age < BIN_FLASH) {
        ctx.globalAlpha = 1 - age / BIN_FLASH;
        ctx.drawImage(sprite.lit, cx - w / 2, cy - h / 2, w, h);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawBalls(g: BoardGeometry): void {
    const img = this.ballImg;
    if (!img || this.balls.length === 0) return;
    const { ctx } = this;
    const size = g.ballRadius * BALL_SPRITE_SCALE * 2;
    const trail = this.reducedMotion ? 0 : TRAIL;

    ctx.globalCompositeOperation = 'lighter';
    for (const ball of this.balls) {
      for (let i = trail; i >= 1; i--) {
        const p = this.mapPoint(ball, ball.trajectory.position(ball.t - i * 0.014));
        const s = size * (1 - i * 0.12);
        ctx.globalAlpha = 0.18 * (1 - i / (trail + 1));
        ctx.drawImage(img, p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (const ball of this.balls) {
      const p = this.mapPoint(ball, ball.trajectory.position(ball.t));
      ctx.drawImage(img, p.x - size / 2, p.y - size / 2, size, size);
    }
  }

  /** Trajectory was built for the board size at spawn; scale it onto the current board. */
  private mapPoint(ball: LiveBall, p: { x: number; y: number }) {
    const from = ball.geometry;
    const to = this.geometry;
    if (!to || from === to) return p;
    // Rows may be stretched vertically, so x and y scale separately.
    const kx = to.spacing / from.spacing;
    const ky = (to.binTop - to.spawnY) / (from.binTop - from.spawnY);
    return {
      x: to.centerX + (p.x - from.centerX) * kx,
      y: to.spawnY + (p.y - from.spawnY) * ky,
    };
  }
}

/** 0 → 1 with a small overshoot. */
function popIn(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = 1.7;
  const x = t - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
}
