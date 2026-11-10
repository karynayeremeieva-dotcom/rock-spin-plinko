import { useEffect, useState } from 'react';
import { formatMultiplier } from '../board/theme';
import { useI18n } from '../i18n/context';
import { BIG_WIN } from './effects';
import { useGame } from './game-context';

interface Win {
  key: number;
  multiplier: number;
  payout: number;
}

const DURATION = 2200;

/**
 * Concert-poster celebration for ×10 and above. Never blocks the game:
 * pointer-events are off and the next big win simply replaces it.
 */
export function BigWin({ onHit }: { onHit: (active: boolean) => void }) {
  const { t, money } = useI18n();
  const game = useGame();
  const [win, setWin] = useState<Win | null>(null);

  useEffect(() => {
    let key = 0;
    let timer = 0;
    const off = game.on((event) => {
      if (event.type !== 'land' || event.entry.multiplier < BIG_WIN) return;
      key += 1;
      setWin({ key, multiplier: event.entry.multiplier, payout: event.entry.payout });
      onHit(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setWin(null);
        onHit(false);
      }, DURATION);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [game, onHit]);

  if (!win) return null;
  const title = win.multiplier >= 250 ? t.epicWin : win.multiplier >= 50 ? t.megaWin : t.bigWin;
  const tier = win.multiplier >= 250 ? 'epic' : win.multiplier >= 50 ? 'mega' : 'big';

  return (
    <div key={win.key} className={`bigwin bigwin--${tier}`} role="status" aria-live="assertive">
      <div className="bigwin__flash" />
      <div className="bigwin__poster">
        <div className="bigwin__title">{title}</div>
        <div className="bigwin__mult">{formatMultiplier(win.multiplier, true)}</div>
        <div className="bigwin__payout">+{money(win.payout)} RC</div>
      </div>
    </div>
  );
}
