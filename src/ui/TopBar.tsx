import { useEffect, useState } from 'react';
import emblemUrl from '../assets/emblem.webp';
import { useI18n } from '../i18n/context';
import { useApp } from './app-context';
import { useGame, useGameState } from './game-context';
import { useAnimatedNumber, usePrefersReducedMotion } from './hooks';
import { IconHistory, IconMenu, IconMute, IconSound } from './icons';
import { HistorySheet, MenuSheet, RulesSheet } from './sheets';

interface WinFlash {
  key: number;
  payout: number;
  tier: 'loss' | 'win' | 'big';
}

type OpenSheet = 'history' | 'menu' | 'rules' | null;

export function TopBar() {
  const { t } = useI18n();
  const { prefs, updatePrefs, sound } = useApp();
  const [open, setOpen] = useState<OpenSheet>(null);

  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand__emblem" src={emblemUrl} alt="" width={36} height={36} />
        <span className="brand__name">Rock Spin</span>
      </div>
      <Balance />
      <div className="topbar__actions">
        <button
          type="button"
          className="icon-btn"
          aria-label={prefs.sound ? t.soundOn : t.soundOff}
          aria-pressed={!prefs.sound}
          onClick={() => {
            sound.unlock();
            updatePrefs({ sound: !prefs.sound });
          }}
        >
          {prefs.sound ? <IconSound /> : <IconMute />}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t.history}
          onClick={() => setOpen('history')}
        >
          <IconHistory />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t.menu}
          onClick={() => setOpen('menu')}
        >
          <IconMenu />
        </button>
      </div>
      {open === 'history' && <HistorySheet onClose={() => setOpen(null)} />}
      {open === 'menu' && (
        <MenuSheet onClose={() => setOpen(null)} onRules={() => setOpen('rules')} />
      )}
      {open === 'rules' && <RulesSheet onClose={() => setOpen(null)} />}
    </header>
  );
}

function Balance() {
  const { t, money } = useI18n();
  const game = useGame();
  const balance = useGameState((s) => s.balance);
  const reducedMotion = usePrefersReducedMotion();
  const shown = useAnimatedNumber(balance, 450, reducedMotion);
  const [flash, setFlash] = useState<WinFlash | null>(null);

  // Each landing shows its payout next to the balance, coloured by how good it was.
  useEffect(() => {
    let key = 0;
    let timer = 0;
    const off = game.on((event) => {
      if (event.type !== 'land') return;
      const { payout, multiplier } = event.entry;
      key += 1;
      setFlash({ key, payout, tier: multiplier >= 10 ? 'big' : multiplier >= 1 ? 'win' : 'loss' });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setFlash(null), 1400);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [game]);

  return (
    <div className="balance" aria-label={t.balance}>
      <span className="balance__label">{t.balance}</span>
      <span className="balance__value" aria-live="polite">
        {money(shown)}
        <span className="balance__unit"> RC</span>
      </span>
      {flash && (
        <span key={flash.key} className={`balance__flash balance__flash--${flash.tier}`}>
          +{money(flash.payout)}
        </span>
      )}
    </div>
  );
}
