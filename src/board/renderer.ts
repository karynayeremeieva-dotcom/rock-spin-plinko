/**
 * Canvas 2D board. Draws pegs, balls and bins; plays each ball along its trajectory and
 * reports when it lands. Owns no game state: money is handled by the engine.
 *
 * Performance:
 * - pegs are drawn once into an offscreen layer; balls, glows and bins are pre-rendered sprites;
 * - the render loop runs only while something moves, and stops when the board is idle;
 * - its own clock advances by at most 50 ms per frame, so a hidden tab (no rAF) simply
 *   pauses the flight and balls continue from the same spot when the tab comes back.
 */
import type { Direction } from '../core/rng';
import { computeGeometry, pegCount, pegX, pegY, type BoardGeometry } from './geometry';
import {
  BALL_SPRITE_SCALE,
  BOARD_COLORS,
  ballSprite,
  binColor,
  binSprites,
  glowSprite,
  pegSprite,
  type BinSpriteSet,
} from './theme';
import { buildTrajectory, type Trajectory } from './trajectory';

export interface RendererCallbacks {
  onLand: (id: string, bin: number) => void;
  onPegHit?: (row: number) => void;
}

export interface RendererOptions {
  reducedMotion?: boolean;
  fontFamily?: string;
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
const TRAIL = 4;
const MAX_DPR = 2;

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
  private pegImg: HTMLCanvasElement | null = null;
  private pegGlowImg: HTMLCanvasElement | null = null;
  private ballImg: HTMLCanvasElement | null = null;
  private bins: BinSpriteSet[] = [];

  private balls: LiveBall[] = [];
  /** row * 32 + peg → time of last hit. */
  private readonly pegFlash = new Map<number, number>();
  private binHit: number[] = [];
  private transitionStart = -Infinity;

  private time = 0;
  private raf = 0;
  private lastFrame = 0;
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    callbacks: RendererCallbacks,
    { reducedMotion = false, fontFamily = 'system-ui, sans-serif' }: RendererOptions = {},
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.callbacks = callbacks;
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
    const g = computeGeometry(this.width, this.height, this.rows);
    this.geometry = g;
    const d = this.dpr;

    this.pegImg = pegSprite(g.pegRadius * d);
    this.pegGlowImg = glowSprite(g.pegRadius * 4 * d, BOARD_COLORS.pegGlow);
    this.ballImg = ballSprite(g.ballRadius * d);
    this.bins = this.table.map((m, k) =>
      binSprites(
        g.binWidth * d,
        g.binHeight * d,
        binColor(Math.abs(k - g.rows / 2) / (g.rows / 2)),
        m,
        this.fontFamily,
      ),
    );

    const layer = document.createElement('canvas');
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const lctx = layer.getContext('2d');
    if (lctx) {
      lctx.setTransform(d, 0, 0, d, 0, 0);
      for (let row = 0; row < g.rows; row++) {
        for (let i = 0; i < pegCount(row); i++) this.drawPeg(lctx, g, row, i, 1);
      }
    }
    this.pegLayer = layer;

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
    const landed: LiveBall[] = [];
    let write = 0;
    for (const ball of this.balls) {
      ball.t += dt;
      const { hits, pegs } = ball.trajectory;
      while (ball.nextHit < hits.length && ball.t >= (hits[ball.nextHit] ?? Infinity)) {
        const row = ball.nextHit;
        this.pegFlash.set(row * 32 + (pegs[row] ?? 0), this.time);
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

  private isAnimating(): boolean {
    if (this.balls.length > 0) return true;
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

    // Pegs.
    if (transitioning) {
      for (let row = 0; row < g.rows; row++) {
        const scale = popIn((sinceTransition - row * 0.016) / 0.22);
        if (scale <= 0) continue;
        for (let i = 0; i < pegCount(row); i++) this.drawPeg(ctx, g, row, i, scale);
      }
    } else if (this.pegLayer) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.pegLayer, 0, 0);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }

    // Peg flashes.
    if (this.pegGlowImg && this.pegFlash.size > 0) {
      const glow = this.pegGlowImg;
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
        ctx.drawImage(glow, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    this.drawBins(g, transitioning ? popIn((sinceTransition - g.rows * 0.016) / 0.22) : 1);
    this.drawBalls(g);
  }

  private drawPeg(
    ctx: CanvasRenderingContext2D,
    g: BoardGeometry,
    row: number,
    index: number,
    scale: number,
  ): void {
    if (!this.pegImg) return;
    const size = (g.pegRadius * 2 + 2 / this.dpr) * scale;
    ctx.drawImage(this.pegImg, pegX(g, row, index) - size / 2, pegY(g, row) - size / 2, size, size);
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
        const p = this.mapPoint(ball, ball.trajectory.position(ball.t - i * 0.018));
        const s = size * (1 - i * 0.12);
        ctx.globalAlpha = 0.3 * (1 - i / (trail + 1));
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
    const k = to.spacing / from.spacing;
    return {
      x: to.centerX + (p.x - from.centerX) * k,
      y: to.spawnY + (p.y - from.spawnY) * k,
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
