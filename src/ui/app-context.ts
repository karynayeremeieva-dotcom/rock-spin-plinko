import { createContext, useContext } from 'react';
import type { SoundEngine } from '../audio/sound';
import type { Prefs } from '../core/storage';

export interface AppServices {
  prefs: Prefs;
  updatePrefs: (patch: Partial<Prefs>) => void;
  sound: SoundEngine;
  /** Short message at the bottom of the screen. */
  notify: (message: string) => void;
}

export const AppContext = createContext<AppServices | null>(null);

export function useApp(): AppServices {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppContext.Provider>');
  return value;
}
