import { describe, expect, it } from 'vitest';
import {
  checkAfterLanding,
  checkBeforeLaunch,
  normalizeAutoConfig,
  roundsLeft,
  type AutoConfig,
} from './auto';

const base: AutoConfig = {
  rounds: 0,
  intervalMs: 300,
  stopOnProfit: null,
  stopOnLoss: null,
  stopOnMultiplier: null,
};

describe('checkBeforeLaunch', () => {
  it('runs forever with rounds = 0 and no limits', () => {
    expect(checkBeforeLaunch(base, { launched: 10_000, profit: -50_000 }, 100, 100)).toBeNull();
  });

  it('stops after the requested number of rounds', () => {
    const config = { ...base, rounds: 10 };
    expect(checkBeforeLaunch(config, { launched: 9, profit: 0 }, 1_000, 100)).toBeNull();
    expect(checkBeforeLaunch(config, { launched: 10, profit: 0 }, 1_000, 100)).toBe('rounds_done');
  });

  it('stops when profit reaches X', () => {
    const config = { ...base, stopOnProfit: 5_000 };
    expect(checkBeforeLaunch(config, { launched: 1, profit: 4_999 }, 1_000, 100)).toBeNull();
    expect(checkBeforeLaunch(config, { launched: 1, profit: 5_000 }, 1_000, 100)).toBe('profit');
  });

  it('stops when loss reaches Y', () => {
    const config = { ...base, stopOnLoss: 2_000 };
    expect(checkBeforeLaunch(config, { launched: 1, profit: -2_000 }, 1_000, 100)).toBe('loss');
  });

  it('never lets the next stake push the loss past Y', () => {
    const config = { ...base, stopOnLoss: 2_000 };
    // 19.00 lost + a 1.00 stake = exactly the limit: still allowed
    expect(checkBeforeLaunch(config, { launched: 1, profit: -1_900 }, 1_000, 100)).toBeNull();
    // 19.01 lost + 1.00 would end at 20.01: stop now
    expect(checkBeforeLaunch(config, { launched: 1, profit: -1_901 }, 1_000, 100)).toBe('loss');
  });

  it('stops when the balance cannot cover the bet', () => {
    expect(checkBeforeLaunch(base, { launched: 0, profit: 0 }, 99, 100)).toBe(
      'insufficient_balance',
    );
    expect(checkBeforeLaunch(base, { launched: 0, profit: 0 }, 100, 100)).toBeNull();
  });
});

describe('checkAfterLanding', () => {
  it('stops on a single win ≥ Z×', () => {
    const config = { ...base, stopOnMultiplier: 10 };
    expect(checkAfterLanding(config, { launched: 1, profit: 0 }, 9.9)).toBeNull();
    expect(checkAfterLanding(config, { launched: 1, profit: 0 }, 10)).toBe('multiplier');
    expect(checkAfterLanding(config, { launched: 1, profit: 0 }, 1000)).toBe('multiplier');
  });

  it('re-checks profit and loss, but not the round count', () => {
    const config = { ...base, rounds: 5, stopOnProfit: 100, stopOnLoss: 100 };
    expect(checkAfterLanding(config, { launched: 5, profit: 0 }, 1)).toBeNull();
    expect(checkAfterLanding(config, { launched: 5, profit: 100 }, 1)).toBe('profit');
    expect(checkAfterLanding(config, { launched: 5, profit: -100 }, 1)).toBe('loss');
  });
});

describe('normalizeAutoConfig', () => {
  it('clamps the interval to 150–1000 ms and drops empty limits', () => {
    const c = normalizeAutoConfig({
      rounds: -3,
      intervalMs: 20,
      stopOnProfit: 0,
      stopOnLoss: -5,
      stopOnMultiplier: 0,
    });
    expect(c).toEqual({ ...base, intervalMs: 150 });
    expect(normalizeAutoConfig({ ...base, intervalMs: 5_000 }).intervalMs).toBe(1_000);
  });

  it('roundsLeft is null for endless sessions', () => {
    expect(roundsLeft(base, { launched: 3, profit: 0 })).toBeNull();
    expect(roundsLeft({ ...base, rounds: 5 }, { launched: 3, profit: 0 })).toBe(2);
  });
});
