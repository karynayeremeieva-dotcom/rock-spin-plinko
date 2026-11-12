/** Side effects that connect the engine to the outside world: storage, sound, Telegram. */
import { useEffect } from 'react';
import type { SoundEngine } from '../audio/sound';
import type { AutoStopReason } from '../core/auto';
import type { PlinkoGame } from '../core/game';
import { writeSave, type Prefs } from '../core/storage';
import type { Dictionary } from '../i18n/dictionaries';
import {
  haptics,
  initTelegram,
  setClosingConfirmation,
  whenTelegramLoaded,
} from '../platform/telegram';

export const BIG_WIN = 10;

/** Saves shortly after every change, and immediately when the page is hidden or closed. */
export function usePersistence(
  game: PlinkoGame,
  prefs: Prefs,
  storage: Storage | null,
  key?: string,
): void {
  useEffect(() => {
    let timer = 0;
    const save = () => {
      window.clearTimeout(timer);
      writeSave(storage, { game: game.toPersisted(), prefs }, key);
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(save, 300);
    };
    const onHide = () => document.visibilityState === 'hidden' && save();
    save();
    const off = game.subscribe(schedule);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      off();
      save();
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [game, prefs, storage, key]);
}

/** Telegram init, haptics and close confirmation while balls fly or auto runs. */
export function useTelegram(game: PlinkoGame): void {
  useEffect(() => {
    whenTelegramLoaded(initTelegram);
    let confirming = false;
    const sync = () => {
      const s = game.getState();
      const busy = s.pending + s.balls > 0 || (s.auto?.running ?? false);
      if (busy !== confirming) {
        confirming = busy;
        setClosingConfirmation(busy);
      }
    };
    const offState = game.subscribe(sync);
    const offEvents = game.on((event) => {
      if (event.type === 'land' && event.entry.multiplier >= BIG_WIN) haptics.notify('success');
      if (event.type === 'error') haptics.notify('error');
      if (event.type === 'auto_stop' && event.reason !== 'user') haptics.notify('warning');
    });
    return () => {
      offState();
      offEvents();
    };
  }, [game]);
}

/** Landing and big-win sounds; peg ticks come from the board renderer. */
export function useGameSounds(game: PlinkoGame, sound: SoundEngine, enabled: boolean): void {
  useEffect(() => sound.setMuted(!enabled), [sound, enabled]);

  useEffect(() => {
    // Browsers only allow audio after a user gesture.
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    const off = game.on((event) => {
      if (event.type !== 'land') return;
      if (event.entry.multiplier >= BIG_WIN) sound.bigWin();
      else sound.land(event.entry.multiplier);
    });
    return () => {
      off();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
  }, [game, sound]);
}

const STOP_MESSAGES: Record<Exclude<AutoStopReason, 'user'>, keyof Dictionary> = {
  rounds_done: 'autoStoppedRounds',
  profit: 'autoStoppedProfit',
  loss: 'autoStoppedLoss',
  multiplier: 'autoStoppedMultiplier',
  insufficient_balance: 'autoStoppedBalance',
  error: 'autoStoppedError',
};

/** Toasts for server errors and for auto mode stopping on its own. */
export function useGameNotices(game: PlinkoGame, t: Dictionary, notify: (m: string) => void) {
  useEffect(
    () =>
      game.on((event) => {
        if (event.type === 'error') notify(t.errorNetwork);
        if (event.type === 'auto_stop' && event.reason !== 'user') {
          notify(t[STOP_MESSAGES[event.reason]]);
        }
      }),
    [game, t, notify],
  );
}
