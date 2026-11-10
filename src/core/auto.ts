import type { Cents } from './money';

export const AUTO_MIN_INTERVAL = 150;
export const AUTO_MAX_INTERVAL = 1000;

export interface AutoConfig {
  /** Number of balls to drop; 0 = until stopped. */
  rounds: number;
  /** Pause between balls, ms (150–1000). */
  intervalMs: number;
  /** Stop once session profit ≥ this, cents. null = off. */
  stopOnProfit: Cents | null;
  /** Stop once session loss ≥ this, cents. null = off. */
  stopOnLoss: Cents | null;
  /** Stop after a single ball pays ≥ this multiplier. null = off. */
  stopOnMultiplier: number | null;
}

export type AutoStopReason =
  'rounds_done' | 'profit' | 'loss' | 'multiplier' | 'insufficient_balance' | 'error' | 'user';

export interface AutoProgress {
  /** Balls launched in this session. */
  launched: number;
  /**
   * Payouts − stakes for this session, cents. Stakes count when the ball is launched
   * (they have left the balance), payouts when it lands. It always equals the change
   * of the balance the player sees since the session started.
   */
  profit: Cents;
}

export function normalizeAutoConfig(config: AutoConfig): AutoConfig {
  const positiveOrNull = (v: number | null) => (v !== null && v > 0 ? v : null);
  return {
    rounds: Math.max(0, Math.floor(config.rounds)),
    intervalMs: Math.min(
      AUTO_MAX_INTERVAL,
      Math.max(AUTO_MIN_INTERVAL, Math.round(config.intervalMs)),
    ),
    stopOnProfit: positiveOrNull(config.stopOnProfit),
    stopOnLoss: positiveOrNull(config.stopOnLoss),
    stopOnMultiplier: positiveOrNull(config.stopOnMultiplier),
  };
}

/** Balls left to launch, or null for an endless session. */
export function roundsLeft(config: AutoConfig, progress: AutoProgress): number | null {
  return config.rounds === 0 ? null : Math.max(0, config.rounds - progress.launched);
}

/** Profit / loss limits. Checked before every launch and after every landing. */
function checkMoneyLimits(config: AutoConfig, progress: AutoProgress): AutoStopReason | null {
  if (config.stopOnProfit !== null && progress.profit >= config.stopOnProfit) return 'profit';
  if (config.stopOnLoss !== null && -progress.profit >= config.stopOnLoss) return 'loss';
  return null;
}

/** Everything that blocks the next launch. */
export function checkBeforeLaunch(
  config: AutoConfig,
  progress: AutoProgress,
  balance: Cents,
  bet: Cents,
): AutoStopReason | null {
  if (config.rounds > 0 && progress.launched >= config.rounds) return 'rounds_done';
  return checkMoneyLimits(config, progress) ?? (bet > balance ? 'insufficient_balance' : null);
}

/** Checked when a ball of this session lands. */
export function checkAfterLanding(
  config: AutoConfig,
  progress: AutoProgress,
  multiplier: number,
): AutoStopReason | null {
  if (config.stopOnMultiplier !== null && multiplier >= config.stopOnMultiplier) {
    return 'multiplier';
  }
  return checkMoneyLimits(config, progress);
}
