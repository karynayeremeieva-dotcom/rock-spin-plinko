import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PlinkoGame } from '../core/game';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeMedia(query: string) {
  return (callback: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
  };
}

const subscribeReducedMotion = subscribeMedia(REDUCED_MOTION);

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/** Auto mode waits while the tab is hidden; the board's own clock pauses with rAF. */
export function usePauseWhenHidden(game: PlinkoGame): void {
  useEffect(() => {
    const sync = () => game.setPaused(document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [game]);
}

/** Integer counter that eases to `target` (cents never become fractional on screen). */
export function useAnimatedNumber(target: number, durationMs = 450, instant = false): number {
  const [value, setValue] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = instant ? 1 : Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - p) ** 3;
      const next = p >= 1 ? target : Math.round(from + (target - from) * eased);
      current.current = next;
      setValue(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, instant]);

  return value;
}
