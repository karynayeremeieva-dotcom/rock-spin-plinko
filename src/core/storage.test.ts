import { describe, expect, it } from 'vitest';
import { calcPayout } from './money';
import { PlinkoGame, type PersistedGame } from './game';
import { DEFAULT_PREFS, loadSave, STORAGE_KEY, writeSave, type Prefs } from './storage';
import type { PlayFn } from '../api/plinko';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const play: PlayFn = ({ bet, rows }) =>
  Promise.resolve({
    id: `b${Math.random()}`,
    path: Array.from({ length: rows }, () => 0 as const),
    bin: 0,
    multiplier: 2,
    payout: calcPayout(bet, 2),
  });

describe('storage', () => {
  it('round-trips balance, settings, history and prefs', async () => {
    const storage = new MemoryStorage();
    const game = new PlinkoGame({ play }, { bet: 500, rows: 12, risk: 'high' });
    const r = await game.drop();
    if (r.ok) game.land(r.ball.id);
    const prefs: Prefs = {
      sound: false,
      lang: 'en',
      skin: 'amp',
      auto: { ...DEFAULT_PREFS.auto, rounds: 0, stopOnMultiplier: 10 },
    };
    writeSave(storage, { game: game.toPersisted(), prefs });

    const loaded = loadSave(storage);
    expect(loaded.prefs).toEqual(prefs);
    const restored = new PlinkoGame({ play }, loaded.game);
    expect(restored.getState()).toMatchObject({
      balance: game.getState().balance,
      bet: 500,
      rows: 12,
      risk: 'high',
    });
    expect(restored.getState().history).toEqual(game.getState().history);
  });

  it('returns defaults for missing, broken or foreign data', () => {
    const storage = new MemoryStorage();
    expect(loadSave(storage)).toEqual({ game: {}, prefs: DEFAULT_PREFS });
    storage.setItem(STORAGE_KEY, '{not json');
    expect(loadSave(storage)).toEqual({ game: {}, prefs: DEFAULT_PREFS });
    storage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
    expect(loadSave(storage)).toEqual({ game: {}, prefs: DEFAULT_PREFS });
    expect(loadSave(null)).toEqual({ game: {}, prefs: DEFAULT_PREFS });
  });

  it('falls back to the guitar design for an unknown skin', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ prefs: { skin: 'banjo' } }));
    expect(loadSave(storage).prefs.skin).toBe('guitar');
  });

  it('drops invalid fields one by one', () => {
    const storage = new MemoryStorage();
    const good = {
      id: 'a',
      time: 1,
      bet: 100,
      rows: 8,
      risk: 'low' as const,
      bin: 4,
      multiplier: 0.5,
      payout: 50,
    };
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        game: {
          balance: 12.5,
          bet: 300,
          rows: 30,
          risk: 'low',
          history: [good, { ...good, payout: -1 }, 'junk'],
        },
        prefs: { sound: 'yes', lang: 'de', auto: { intervalMs: 5, rounds: 3 } },
      }),
    );
    const { game, prefs } = loadSave(storage);
    expect(game).toEqual({
      bet: 300,
      risk: 'low',
      history: [good],
    } satisfies Partial<PersistedGame>);
    expect(prefs.sound).toBe(true);
    expect(prefs.lang).toBeNull();
    expect(prefs.auto.intervalMs).toBe(150);
    expect(prefs.auto.rounds).toBe(3);
  });

  it('survives a storage that throws on write', () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const game = new PlinkoGame({ play });
    expect(() =>
      writeSave(storage, { game: game.toPersisted(), prefs: DEFAULT_PREFS }),
    ).not.toThrow();
  });
});
