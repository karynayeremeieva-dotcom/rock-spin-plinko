import { binColor, rgb } from '../board/theme';
import type { HistoryEntry } from '../core/game';

/** 0.2734 → "27.3%", 0.0000153 → "0.00153%": always three significant digits. */
export function formatPercent(p: number): string {
  const pct = p * 100;
  return `${pct >= 100 ? '100' : Number(pct.toPrecision(3))}%`;
}

/** Same colour as the bin the ball landed in. */
export function binTint(entry: Pick<HistoryEntry, 'bin' | 'rows'>): string {
  return rgb(binColor(Math.abs(entry.bin - entry.rows / 2) / (entry.rows / 2)));
}
