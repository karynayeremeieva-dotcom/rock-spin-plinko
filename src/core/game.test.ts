import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeServer, type PlayFn, type PlayResult } from '../api/plinko';
import type { AutoConfig } from './auto';
import { calcPayout } from './money';
import { INITIAL_BALANCE, MAX_BALLS, PlinkoGame, type GameState } from './game';

/** Server stub that answers instantly with the given multipliers, in order, then 1×. */
function scriptedPlay(multipliers: number[] = []): PlayFn {
  let n = 0;
  return ({ bet, rows }) => {
    const multiplier = multipliers[n] ?? 1;
    n += 1;
    const result: PlayResult = {
      id: `ball-${n}`,
      path: Array.from({ length: rows }, () => 0 as const),
      bin: 0,
      multiplier,
      payout: calcPayout(bet, multiplier),
    };
    return Promise.resolve(result);
  };
}

function balanceAddsUp({ balance, ledger }: GameState) {
  return balance === ledger.start - ledger.wagered + ledger.paid;
}

describe('manual drops', () => {
  it('debits on drop and credits on landing', async () => {
    const game = new PlinkoGame({ play: scriptedPlay([5.6]) });
    game.setBet(1_000);
    const promise = game.drop();
    expect(game.getState().balance).toBe(INITIAL_BALANCE - 1_000);
    expect(game.getState().pending).toBe(1);

    const result = await promise;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(game.getState().balls).toBe(1);
    expect(game.getState().balance).toBe(INITIAL_BALANCE - 1_000);

    game.land(result.ball.id);
    expect(game.getState().balance).toBe(INITIAL_BALANCE - 1_000 + 5_600);
    expect(game.getState().history[0]).toMatchObject({
      bet: 1_000,
      multiplier: 5.6,
      payout: 5_600,
    });
    expect(balanceAddsUp(game.getState())).toBe(true);
  });

  it('landing twice pays once', async () => {
    const game = new PlinkoGame({ play: scriptedPlay([2]) });
    const r = await game.drop();
    if (!r.ok) throw new Error('drop failed');
    game.land(r.ball.id);
    game.land(r.ball.id);
    expect(game.getState().balance).toBe(INITIAL_BALANCE + 100);
  });

  it('fast clicks never push the balance below zero', async () => {
    const game = new PlinkoGame({ play: scriptedPlay() }, { balance: 350, bet: 100 });
    const results = await Promise.all(Array.from({ length: 20 }, () => game.drop()));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.reason === 'insufficient')).toHaveLength(17);
    expect(game.getState().balance).toBe(50);
  });

  it(`allows at most ${MAX_BALLS} balls at once`, async () => {
    const game = new PlinkoGame({ play: scriptedPlay() });
    const results = await Promise.all(Array.from({ length: 60 }, () => game.drop()));
    expect(results.filter((r) => r.ok)).toHaveLength(MAX_BALLS);
    expect(results.filter((r) => !r.ok && r.reason === 'too_many_balls')).toHaveLength(10);
  });

  it('refunds the stake when the server fails', async () => {
    const game = new PlinkoGame({ play: () => Promise.reject(new Error('offline')) });
    const errors: unknown[] = [];
    game.on((e) => e.type === 'error' && errors.push(e.error));
    const r = await game.drop();
    expect(r).toEqual({ ok: false, reason: 'network' });
    expect(game.getState().balance).toBe(INITIAL_BALANCE);
    expect(errors).toHaveLength(1);
    expect(balanceAddsUp(game.getState())).toBe(true);
  });

  it('locks rows and risk while balls are in flight, but not the bet', async () => {
    const game = new PlinkoGame({ play: scriptedPlay() });
    const r = await game.drop();
    if (!r.ok) throw new Error('drop failed');
    expect(game.setRows(8)).toBe(false);
    expect(game.setRisk('high')).toBe(false);
    game.setBet(500);
    expect(game.getState().bet).toBe(500);
    game.land(r.ball.id);
    expect(game.setRows(8)).toBe(true);
    expect(game.setRisk('high')).toBe(true);
    expect(game.getState()).toMatchObject({ rows: 8, risk: 'high' });
  });

  it('keeps the last 50 history entries, newest first', async () => {
    const game = new PlinkoGame({ play: scriptedPlay() });
    for (let i = 0; i < 60; i++) {
      const r = await game.drop();
      if (r.ok) game.land(r.ball.id);
    }
    const { history } = game.getState();
    expect(history).toHaveLength(50);
    expect(history[0]?.id).toBe('ball-60');
  });
});

describe('balance adds up', () => {
  it('start − stakes + payouts = balance after 2 000 random balls', async () => {
    const game = new PlinkoGame({ play: createFakeServer({ sleep: () => Promise.resolve() }) });
    let stakes = 0;
    let payouts = 0;
    for (let i = 0; i < 2_000; i++) {
      game.setBet(10 + ((i * 7919) % 2_000));
      const r = await game.drop();
      if (!r.ok) {
        game.resetBalance();
        stakes = 0;
        payouts = 0;
        continue;
      }
      stakes += r.ball.bet;
      payouts += r.ball.result.payout;
      game.land(r.ball.id);
      expect(game.getState().balance).toBe(INITIAL_BALANCE - stakes + payouts);
    }
    expect(balanceAddsUp(game.getState())).toBe(true);
  });
});

describe('auto mode', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const auto = (patch: Partial<AutoConfig>): AutoConfig => ({
    rounds: 0,
    intervalMs: 200,
    stopOnProfit: null,
    stopOnLoss: null,
    stopOnMultiplier: null,
    ...patch,
  });

  /** Board stub: lands every ball as soon as it appears. */
  function autoLand(game: PlinkoGame) {
    game.on((e) => {
      if (e.type === 'ball') game.land(e.ball.id);
    });
  }

  it('launches exactly N balls, one per interval', async () => {
    const game = new PlinkoGame({ play: scriptedPlay() });
    autoLand(game);
    game.startAuto(auto({ rounds: 5 }));
    expect(game.getState().auto?.progress.launched).toBe(1);
    await vi.advanceTimersByTimeAsync(199);
    expect(game.getState().auto?.progress.launched).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(game.getState().auto?.progress.launched).toBe(2);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(game.getState().auto).toMatchObject({
      running: false,
      stopReason: 'rounds_done',
      progress: { launched: 5 },
    });
  });

  it('stops when profit ≥ X', async () => {
    const game = new PlinkoGame({ play: scriptedPlay([1, 1, 3, 1, 1]) }, { bet: 1_000 });
    autoLand(game);
    game.startAuto(auto({ stopOnProfit: 1_500 }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(game.getState().auto).toMatchObject({ running: false, stopReason: 'profit' });
    expect(game.getState().auto?.progress).toEqual({ launched: 3, profit: 2_000 });
  });

  it('stops when loss ≥ Y', async () => {
    const game = new PlinkoGame({ play: scriptedPlay(Array(100).fill(0.5)) }, { bet: 1_000 });
    autoLand(game);
    game.startAuto(auto({ stopOnLoss: 2_000 }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(game.getState().auto).toMatchObject({ running: false, stopReason: 'loss' });
    expect(game.getState().auto?.progress).toEqual({ launched: 4, profit: -2_000 });
  });

  it('stops on a single win ≥ Z×', async () => {
    const game = new PlinkoGame({ play: scriptedPlay([1, 0.5, 26, 1]) });
    autoLand(game);
    game.startAuto(auto({ stopOnMultiplier: 10 }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(game.getState().auto).toMatchObject({ running: false, stopReason: 'multiplier' });
    expect(game.getState().auto?.progress.launched).toBe(3);
  });

  it('stops when the balance runs out and never goes negative', async () => {
    const game = new PlinkoGame(
      { play: scriptedPlay(Array(100).fill(0.2)) },
      { balance: 1_000, bet: 300 },
    );
    autoLand(game);
    game.startAuto(auto({ intervalMs: 150 }));
    await vi.advanceTimersByTimeAsync(10_000);
    const s = game.getState();
    expect(s.auto).toMatchObject({ running: false, stopReason: 'insufficient_balance' });
    expect(s.balance).toBeGreaterThanOrEqual(0);
    expect(s.balance).toBeLessThan(300);
    expect(balanceAddsUp(s)).toBe(true);
  });

  it('Stop is instant: no new balls, flying balls still land and pay', async () => {
    const game = new PlinkoGame({ play: scriptedPlay(Array(100).fill(2)) });
    const flying: string[] = [];
    game.on((e) => e.type === 'ball' && flying.push(e.ball.id));
    game.startAuto(auto({ intervalMs: 150 }));
    await vi.advanceTimersByTimeAsync(450); // 4 launches, none landed
    game.stopAuto();
    const launched = game.getState().auto?.progress.launched;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(game.getState().auto?.progress.launched).toBe(launched);
    expect(game.getState().auto?.stopReason).toBe('user');

    const before = game.getState().balance;
    flying.forEach((id) => game.land(id));
    expect(game.getState().balance).toBe(before + flying.length * 200);
    expect(game.getState().auto?.progress.profit).toBe(flying.length * 100);
  });

  it('blocks manual drops, rows and risk while running', async () => {
    const game = new PlinkoGame({ play: scriptedPlay() });
    autoLand(game);
    game.startAuto(auto({}));
    await vi.advanceTimersByTimeAsync(0);
    expect(await game.drop()).toEqual({ ok: false, reason: 'auto_running' });
    expect(game.setRows(8)).toBe(false);
    game.stopAuto();
  });

  it('waits while the page is hidden', async () => {
    const game = new PlinkoGame({ play: scriptedPlay() });
    autoLand(game);
    game.startAuto(auto({}));
    game.setPaused(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(game.getState().auto?.progress.launched).toBe(1);
    game.setPaused(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(game.getState().auto?.progress.launched).toBe(2);
    game.stopAuto();
  });

  it('waits instead of exceeding 50 balls on the board', async () => {
    const game = new PlinkoGame({ play: scriptedPlay() });
    game.startAuto(auto({ intervalMs: 150 })); // nobody lands the balls
    await vi.advanceTimersByTimeAsync(150 * 80);
    expect(game.getState().balls).toBe(MAX_BALLS);
    expect(game.getState().auto?.running).toBe(true);
    game.stopAuto();
  });
});

describe('persistence', () => {
  it('saves balls in flight as landed so a reload never loses money', async () => {
    const game = new PlinkoGame({ play: scriptedPlay([3]) }, { bet: 1_000 });
    await game.drop();
    const saved = game.toPersisted();
    expect(saved.balance).toBe(INITIAL_BALANCE + 2_000);
    expect(saved.history).toHaveLength(1);

    const restored = new PlinkoGame({ play: scriptedPlay() }, saved);
    expect(restored.getState()).toMatchObject({ balance: INITIAL_BALANCE + 2_000, bet: 1_000 });
  });

  it('saves stakes still waiting for the server as refunded', () => {
    const game = new PlinkoGame({ play: () => new Promise(() => {}) }, { bet: 1_000 });
    void game.drop();
    expect(game.getState().balance).toBe(INITIAL_BALANCE - 1_000);
    expect(game.toPersisted().balance).toBe(INITIAL_BALANCE);
  });

  it('ignores corrupted saved values', () => {
    const game = new PlinkoGame(
      { play: scriptedPlay() },
      // @ts-expect-error -- simulating a corrupted localStorage payload
      { balance: -5, bet: 'x', rows: 99, risk: 'insane', history: 'nope' },
    );
    expect(game.getState()).toMatchObject({
      balance: INITIAL_BALANCE,
      bet: 100,
      rows: 16,
      risk: 'medium',
      history: [],
    });
  });
});
