import { useEffect, useSyncExternalStore } from 'react';
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
