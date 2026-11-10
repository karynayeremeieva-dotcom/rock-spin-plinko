import { useEffect, useState } from 'react';
import { play } from './api/plinko';
import { PlinkoGame } from './core/game';
import { detectLang } from './i18n/dictionaries';
import { useI18n } from './i18n/context';
import { I18nProvider } from './i18n/i18n';
import { Board } from './ui/Board';
import { BetPanel } from './ui/BetPanel';
import { GameContext, useGame } from './ui/game-context';
import { usePauseWhenHidden } from './ui/hooks';
import { ResultsFeed } from './ui/ResultsFeed';
import { TopBar } from './ui/TopBar';

export function App() {
  const [game] = useState(() => new PlinkoGame({ play }));
  const [lang] = useState(detectLang);
  usePauseWhenHidden(game);

  return (
    <I18nProvider lang={lang}>
      <GameContext.Provider value={game}>
        <div className="stage" aria-hidden="true" />
        <main className="app">
          <TopBar />
          <section className="play">
            <Board />
            <ResultsFeed />
          </section>
          <BetPanel />
          <Toast />
        </main>
      </GameContext.Provider>
    </I18nProvider>
  );
}

/** Short notice when the server fails; the stake is already refunded by the engine. */
function Toast() {
  const { t } = useI18n();
  const game = useGame();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer = 0;
    const off = game.on((event) => {
      if (event.type !== 'error') return;
      setVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(false), 3000);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [game]);

  return visible ? (
    <div className="toast" role="status">
      {t.errorNetwork}
    </div>
  ) : null;
}
