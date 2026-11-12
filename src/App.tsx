import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { play } from './api/plinko';
import { SoundEngine } from './audio/sound';
import { PlinkoGame } from './core/game';
import { isSkin, loadSave, safeStorage, saveKey, type Prefs } from './core/storage';
import { useI18n } from './i18n/context';
import { detectLang } from './i18n/dictionaries';
import { I18nProvider } from './i18n/i18n';
import { telegramUserId } from './platform/telegram';
import { AppContext, useApp, type AppServices } from './ui/app-context';
import { BetPanel } from './ui/BetPanel';
import { BigWin } from './ui/BigWin';
import { Board } from './ui/Board';
import { useGameNotices, useGameSounds, usePersistence, useTelegram } from './ui/effects';
import { GameContext, useGame } from './ui/game-context';
import { usePauseWhenHidden } from './ui/hooks';
import { ResultsFeed } from './ui/ResultsFeed';
import { TopBar } from './ui/TopBar';

// The multiplier editor is a separate chunk, downloaded only with ?dev=1 in the URL.
const DevPanel = lazy(() => import('./dev/DevPanel'));
const params = new URLSearchParams(window.location.search);
const DEV_MODE = params.get('dev') === '1';
/** ?skin=guitar|minimal opens a given board design (and remembers it). */
const URL_SKIN = params.get('skin');

export function App() {
  const [storage] = useState(safeStorage);
  const [key] = useState(() => saveKey(telegramUserId()));
  const [boot] = useState(() => loadSave(storage, key));
  const [game] = useState(() => new PlinkoGame({ play }, boot.game));
  const [sound] = useState(() => new SoundEngine());
  const [prefs, setPrefs] = useState<Prefs>(() =>
    isSkin(URL_SKIN) ? { ...boot.prefs, skin: URL_SKIN } : boot.prefs,
  );
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);

  const updatePrefs = useCallback(
    (patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch })),
    [],
  );
  const clearToast = useCallback(() => setToast(null), []);
  const notify = useCallback((text: string) => setToast({ key: Date.now(), text }), []);
  const services = useMemo<AppServices>(
    () => ({ prefs, updatePrefs, sound, notify }),
    [prefs, updatePrefs, sound, notify],
  );

  usePauseWhenHidden(game);
  useEffect(() => {
    // Dev builds only: lets you poke the engine from the console. Stripped from production.
    if (import.meta.env.DEV) (window as { __plinko?: PlinkoGame }).__plinko = game;
  }, [game]);
  usePersistence(game, prefs, storage, key);
  useTelegram(game);
  useGameSounds(game, sound, prefs.sound);

  return (
    <I18nProvider lang={prefs.lang ?? detectLang()}>
      <GameContext.Provider value={game}>
        <AppContext.Provider value={services}>
          <Screen toast={toast} onToastDone={clearToast} />
        </AppContext.Provider>
      </GameContext.Provider>
    </I18nProvider>
  );
}

function Screen({
  toast,
  onToastDone,
}: {
  toast: { key: number; text: string } | null;
  onToastDone: () => void;
}) {
  const { t } = useI18n();
  const game = useGame();
  const { notify, prefs } = useApp();
  const [hit, setHit] = useState(false);
  useGameNotices(game, t, notify);

  return (
    <>
      <div className={`stage stage--${prefs.skin} ${hit ? 'stage--hit' : ''}`} aria-hidden="true" />
      <main className="app">
        <TopBar />
        <section className="play">
          <Board />
          <ResultsFeed />
        </section>
        <BetPanel />
      </main>
      <BigWin onHit={setHit} />
      {DEV_MODE && (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
      )}
      {toast && <Toast key={toast.key} text={toast.text} onDone={onToastDone} />}
    </>
  );
}

function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 3000);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  return (
    <div className="toast" role="status">
      {text}
    </div>
  );
}
