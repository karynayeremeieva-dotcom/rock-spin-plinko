import { createContext, useContext, useSyncExternalStore } from 'react';
import type { GameState, PlinkoGame } from '../core/game';

export const GameContext = createContext<PlinkoGame | null>(null);

export function useGame(): PlinkoGame {
  const game = useContext(GameContext);
  if (!game) throw new Error('useGame must be used inside <GameContext.Provider>');
  return game;
}

/** Re-renders when the selected slice changes. Selectors must return stable values (no new objects). */
export function useGameState<T>(selector: (state: GameState) => T): T {
  const game = useGame();
  return useSyncExternalStore(game.subscribe, () => selector(game.getState()));
}
