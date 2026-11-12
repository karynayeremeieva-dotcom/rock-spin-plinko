/**
 * Game engine: balance, bets, balls in flight, history and auto mode.
 * Knows nothing about React or Canvas. The UI reads `getState()` / `subscribe()`,
 * the board listens for `ball` events and calls `land(id)` when the animation ends.
 */
import type { PlayFn, PlayResult } from '../api/plinko';
import {
  checkAfterLanding,
  checkBeforeLaunch,
  normalizeAutoConfig,
  roundsLeft,
  type AutoConfig,
  type AutoProgress,
  type AutoStopReason,
} from './auto';
import { MAX_BET, MIN_BET, validateBet, type BetError } from './bet';
import type { Cents } from './money';
import { getTable, isRisk, isRows, type Risk } from './multipliers';
import { cryptoRandomBytes, randomId } from './rng';
import { verifyRound } from './round';

export const INITIAL_BALANCE: Cents = 100_000; // 1 000.00 RC
export const MAX_BALLS = 50;
export const HISTORY_LIMIT = 50;
/** First-visit row count: a balanced board; players can go 8–16. */
export const DEFAULT_ROWS = 12;
/** How long to wait for `play` before giving up and refunding the stake. */
export const PLAY_TIMEOUT_MS = 10_000;
/**
 * Safety net: a ball the board never reported as landed (a rendering failure) is credited
 * after this long. A real flight takes 2–3 s, so this never races the animation.
 */
export const LAND_TIMEOUT_MS = 20_000;

/** `play` failed in a way the game noticed itself: timeout or an inconsistent answer. */
export class RoundError extends Error {
  override name = 'RoundError';
}

export interface Ball {
  id: string;
  bet: Cents;
  rows: number;
  risk: Risk;
  result: PlayResult;
  /** Auto session that launched the ball, or null for a manual drop. */
  autoSession: number | null;
}

export interface HistoryEntry {
  id: string;
  /** Unix ms when the ball landed. */
  time: number;
  bet: Cents;
  rows: number;
  risk: Risk;
  bin: number;
  multiplier: number;
  payout: Cents;
}

export interface AutoState {
  session: number;
  config: AutoConfig;
  progress: AutoProgress;
  running: boolean;
  stopReason: AutoStopReason | null;
}

export interface GameState {
  balance: Cents;
  bet: Cents;
  rows: number;
  risk: Risk;
  /** Requests sent to `play` and not answered yet. Their stakes are already debited. */
  pending: number;
  /** Balls on the board. Their stakes are debited, payouts not yet credited. */
  balls: number;
  /** Newest first, at most HISTORY_LIMIT. */
  history: readonly HistoryEntry[];
  /** Current or last auto session. */
  auto: AutoState | null;
  /** Page hidden: auto mode waits. */
  paused: boolean;
  /** Ledger since the last balance reset, for the "balance adds up" check. */
  ledger: { start: Cents; wagered: Cents; paid: Cents };
}

export type DropError = BetError | 'too_many_balls' | 'auto_running' | 'network';
export type DropResult = { ok: true; ball: Ball } | { ok: false; reason: DropError };

export type GameEvent =
  | { type: 'ball'; ball: Ball }
  | { type: 'land'; ball: Ball; entry: HistoryEntry }
  | { type: 'auto_stop'; reason: AutoStopReason }
  | { type: 'error'; error: unknown };

export interface PersistedGame {
  balance: Cents;
  bet: Cents;
  rows: number;
  risk: Risk;
  history: HistoryEntry[];
}

export interface GameDeps {
  play: PlayFn;
  now?: () => number;
  /** Table the server's answers are checked against (the active config by default). */
  getTable?: (rows: number, risk: Risk) => readonly number[];
  /** Overrides for tests. */
  playTimeoutMs?: number;
  landTimeoutMs?: number;
}

export class PlinkoGame {
  private state: GameState;
  private readonly balls = new Map<string, Ball>();
  private readonly listeners = new Set<() => void>();
  private readonly eventListeners = new Set<(event: GameEvent) => void>();
  private readonly play: PlayFn;
  private readonly now: () => number;
  private readonly tableFor: (rows: number, risk: Risk) => readonly number[];
  private readonly playTimeoutMs: number;
  private readonly landTimeoutMs: number;
  /** Fallback timers per ball on the board (see LAND_TIMEOUT_MS). */
  private readonly landTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  private autoSessionCounter = 0;
  /** Sum of stakes of requests still waiting for `play`. */
  private pendingStake: Cents = 0;

  constructor(deps: GameDeps, saved?: Partial<PersistedGame>) {
    this.play = deps.play;
    this.now = deps.now ?? Date.now;
    this.tableFor = deps.getTable ?? getTable;
    this.playTimeoutMs = deps.playTimeoutMs ?? PLAY_TIMEOUT_MS;
    this.landTimeoutMs = deps.landTimeoutMs ?? LAND_TIMEOUT_MS;
    const balance = isNonNegativeInt(saved?.balance) ? saved.balance : INITIAL_BALANCE;
    this.state = {
      balance,
      bet:
        isNonNegativeInt(saved?.bet) && saved.bet >= MIN_BET && saved.bet <= MAX_BET
          ? saved.bet
          : 100,
      rows: isRows(saved?.rows) ? saved.rows : DEFAULT_ROWS,
      risk: isRisk(saved?.risk) ? saved.risk : 'medium',
      pending: 0,
      balls: 0,
      history: Array.isArray(saved?.history) ? saved.history.slice(0, HISTORY_LIMIT) : [],
      auto: null,
      paused: false,
      ledger: { start: balance, wagered: 0, paid: 0 },
    };
  }

  // ---------- subscription ----------

  getState = (): GameState => this.state;

  /** For useSyncExternalStore. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  on(listener: (event: GameEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private update(patch: Partial<GameState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private emit(event: GameEvent) {
    this.eventListeners.forEach((l) => l(event));
  }

  // ---------- derived ----------

  /** Anything on the way: waiting for the server or on the board. */
  get inFlight(): number {
    return this.state.pending + this.state.balls;
  }

  get isAutoRunning(): boolean {
    return this.state.auto?.running ?? false;
  }

  /** Rows and risk are locked while any ball is in flight or auto mode runs. */
  get isLocked(): boolean {
    return this.inFlight > 0 || this.isAutoRunning;
  }

  // ---------- settings ----------

  setBet(bet: Cents): void {
    if (!isNonNegativeInt(bet) || bet === this.state.bet) return;
    this.update({ bet });
  }

  setRows(rows: number): boolean {
    if (!isRows(rows) || this.isLocked) return false;
    if (rows !== this.state.rows) this.update({ rows });
    return true;
  }

  setRisk(risk: Risk): boolean {
    if (!isRisk(risk) || this.isLocked) return false;
    if (risk !== this.state.risk) this.update({ risk });
    return true;
  }

  /** Back to the starting demo balance. Only when nothing is in flight. */
  resetBalance(): boolean {
    if (this.isLocked) return false;
    this.update({
      balance: INITIAL_BALANCE,
      ledger: { start: INITIAL_BALANCE, wagered: 0, paid: 0 },
      auto: null,
    });
    return true;
  }

  clearHistory(): void {
    this.update({ history: [] });
  }

  setPaused(paused: boolean): void {
    if (paused === this.state.paused) return;
    this.update({ paused });
    if (paused) this.clearAutoTimer();
    else if (this.isAutoRunning) this.scheduleAuto(this.state.auto?.config.intervalMs ?? 0);
  }

  // ---------- dropping ----------

  /** Manual drop (button or Space). */
  drop(): Promise<DropResult> {
    if (this.isAutoRunning) return Promise.resolve({ ok: false, reason: 'auto_running' });
    return this.launch(null);
  }

  /**
   * The stake leaves the balance synchronously, before awaiting the server,
   * so any number of fast clicks can never push the balance below zero.
   */
  private launch(autoSession: number | null): Promise<DropResult> {
    const { bet, rows, risk, balance } = this.state;
    if (this.inFlight >= MAX_BALLS) return Promise.resolve({ ok: false, reason: 'too_many_balls' });
    const error = validateBet(bet, balance);
    if (error) return Promise.resolve({ ok: false, reason: error });

    this.pendingStake += bet;
    this.update({
      balance: balance - bet,
      pending: this.state.pending + 1,
      ledger: { ...this.state.ledger, wagered: this.state.ledger.wagered + bet },
      auto: this.patchAuto(autoSession, (p) => ({
        launched: p.launched + 1,
        profit: p.profit - bet,
      })),
    });

    return this.request({ bet, rows, risk }).then(
      (result) => {
        this.pendingStake -= bet;
        const ball: Ball = { id: result.id, bet, rows, risk, result, autoSession };
        this.balls.set(ball.id, ball);
        this.armLandTimer(ball.id);
        this.update({ pending: this.state.pending - 1, balls: this.balls.size });
        this.emit({ type: 'ball', ball });
        return { ok: true, ball } as const;
      },
      (error: unknown) => {
        // Server refused, network failed, timed out or sent nonsense: the stake comes back.
        this.pendingStake -= bet;
        this.update({
          balance: this.state.balance + bet,
          pending: this.state.pending - 1,
          ledger: { ...this.state.ledger, wagered: this.state.ledger.wagered - bet },
          auto: this.patchAuto(autoSession, (p) => ({
            launched: p.launched - 1,
            profit: p.profit + bet,
          })),
        });
        this.emit({ type: 'error', error });
        if (autoSession !== null && this.state.auto?.session === autoSession) {
          this.stopAuto('error');
        }
        return { ok: false, reason: 'network' } as const;
      },
    );
  }

  /**
   * One call to `play`, guarded: a unique request id, a timeout that aborts the request,
   * and a check that the answer is consistent with the request and the table, because
   * the board animates `path` while the balance pays `payout`.
   */
  private request(req: { bet: Cents; rows: number; risk: Risk }) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new RoundError(`No answer from the server in ${this.playTimeoutMs} ms`));
      }, this.playTimeoutMs);
    });
    const answer = this.play({
      ...req,
      requestId: randomId(cryptoRandomBytes),
      signal: controller.signal,
    }).then((result) => {
      const problem = verifyRound(result, req.bet, this.tableFor(req.rows, req.risk));
      if (problem) throw new RoundError(`Invalid server answer: ${problem}`);
      if (this.balls.has(result.id)) throw new RoundError(`Duplicate round id ${result.id}`);
      return result;
    });
    return Promise.race([answer, timeout]).finally(() => clearTimeout(timer));
  }

  private armLandTimer(id: string) {
    const timer = setTimeout(() => {
      this.landTimers.delete(id);
      if (!this.balls.has(id)) return;
      // A hidden page pauses the flight: wait for it rather than paying early.
      if (this.state.paused) this.armLandTimer(id);
      else this.land(id);
    }, this.landTimeoutMs);
    this.landTimers.set(id, timer);
  }

  /** Called by the board when a ball reaches its bin. Credits the payout. Idempotent. */
  land(id: string): HistoryEntry | null {
    const ball = this.balls.get(id);
    if (!ball) return null;
    this.balls.delete(id);
    clearTimeout(this.landTimers.get(id));
    this.landTimers.delete(id);

    const { payout, multiplier, bin } = ball.result;
    const entry: HistoryEntry = {
      id,
      time: this.now(),
      bet: ball.bet,
      rows: ball.rows,
      risk: ball.risk,
      bin,
      multiplier,
      payout,
    };
    const auto = this.patchAuto(ball.autoSession, (p) => ({ ...p, profit: p.profit + payout }));
    this.update({
      balance: this.state.balance + payout,
      balls: this.balls.size,
      history: [entry, ...this.state.history].slice(0, HISTORY_LIMIT),
      ledger: { ...this.state.ledger, paid: this.state.ledger.paid + payout },
      auto,
    });
    this.emit({ type: 'land', ball, entry });

    if (auto?.running && auto.session === ball.autoSession) {
      const reason = checkAfterLanding(auto.config, auto.progress, multiplier);
      if (reason) this.stopAuto(reason);
    }
    return entry;
  }

  /** Lands every ball immediately (e.g. the board was torn down). */
  landAll(): void {
    for (const id of [...this.balls.keys()]) this.land(id);
  }

  // ---------- auto mode ----------

  startAuto(config: AutoConfig): boolean {
    if (this.isAutoRunning) return false;
    this.autoSessionCounter += 1;
    this.update({
      auto: {
        session: this.autoSessionCounter,
        config: normalizeAutoConfig(config),
        progress: { launched: 0, profit: 0 },
        running: true,
        stopReason: null,
      },
    });
    this.autoTick();
    return true;
  }

  /** Stops launching immediately. Balls already in flight still land and pay. */
  stopAuto(reason: AutoStopReason = 'user'): void {
    this.clearAutoTimer();
    const auto = this.state.auto;
    if (!auto?.running) return;
    this.update({ auto: { ...auto, running: false, stopReason: reason } });
    this.emit({ type: 'auto_stop', reason });
  }

  private autoTick = () => {
    this.autoTimer = null;
    const auto = this.state.auto;
    if (!auto?.running || this.state.paused) return;

    const reason = checkBeforeLaunch(
      auto.config,
      auto.progress,
      this.state.balance,
      this.state.bet,
    );
    // The last ball is only "done" once the server has answered: if that request fails,
    // the session stops with an error instead of claiming every round was played.
    if (reason === 'rounds_done' && this.state.pending > 0) {
      this.scheduleAuto(50);
      return;
    }
    if (reason) {
      this.stopAuto(reason);
      return;
    }

    if (this.inFlight < MAX_BALLS) {
      const error = validateBet(this.state.bet, this.state.balance);
      if (error) {
        this.stopAuto(error === 'insufficient' ? 'insufficient_balance' : 'error');
        return;
      }
      void this.launch(auto.session);
      const after = this.state.auto;
      if (after && roundsLeft(after.config, after.progress) === 0) {
        // Re-check soon: stops as 'rounds_done' once the last answer is in.
        this.scheduleAuto(50);
        return;
      }
    }
    this.scheduleAuto(auto.config.intervalMs);
  };

  private scheduleAuto(ms: number) {
    this.clearAutoTimer();
    this.autoTimer = setTimeout(this.autoTick, ms);
  }

  private clearAutoTimer() {
    if (this.autoTimer !== null) clearTimeout(this.autoTimer);
    this.autoTimer = null;
  }

  private patchAuto(
    session: number | null,
    change: (progress: AutoProgress) => AutoProgress,
  ): AutoState | null {
    const auto = this.state.auto;
    if (session === null || !auto || auto.session !== session) return auto;
    return { ...auto, progress: change(auto.progress) };
  }

  // ---------- persistence ----------

  /**
   * What to save. Results of balls in flight are already decided by the server,
   * so they are saved as landed: a reload never loses a payout. Requests still
   * waiting for an answer are saved as refunded.
   */
  toPersisted(): PersistedGame {
    let balance = this.state.balance;
    let history = [...this.state.history];
    for (const ball of this.balls.values()) {
      balance += ball.result.payout;
      history = [
        {
          id: ball.id,
          time: this.now(),
          bet: ball.bet,
          rows: ball.rows,
          risk: ball.risk,
          bin: ball.result.bin,
          multiplier: ball.result.multiplier,
          payout: ball.result.payout,
        },
        ...history,
      ];
    }
    balance += this.pendingStake;
    const { bet, rows, risk } = this.state;
    return { balance, bet, rows, risk, history: history.slice(0, HISTORY_LIMIT) };
  }

  dispose(): void {
    this.clearAutoTimer();
    this.landTimers.forEach((timer) => clearTimeout(timer));
    this.landTimers.clear();
    this.listeners.clear();
    this.eventListeners.clear();
  }
}

function isNonNegativeInt(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
