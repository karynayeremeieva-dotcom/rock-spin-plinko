import { useEffect, useState } from 'react';
import { play } from './api/plinko';
import { PlinkoGame } from './core/game';
import { formatCents, parseAmount } from './core/money';
import { RISKS, ROW_OPTIONS, type Risk } from './core/multipliers';
import { Board } from './ui/Board';
import { GameContext, useGame, useGameState } from './ui/game-context';
import { usePauseWhenHidden } from './ui/hooks';

export function App() {
  const [game] = useState(() => new PlinkoGame({ play }));
  usePauseWhenHidden(game);

  return (
    <GameContext.Provider value={game}>
      <main className="app">
        <Balance />
        <Board />
        <DevControls />
      </main>
    </GameContext.Provider>
  );
}

function Balance() {
  const balance = useGameState((s) => s.balance);
  return <div className="balance">{formatCents(balance)} RC</div>;
}

/** Temporary controls for stage 2; the real panel comes in stage 3. */
function DevControls() {
  const game = useGame();
  const rows = useGameState((s) => s.rows);
  const risk = useGameState((s) => s.risk);
  const inFlight = useGameState((s) => s.pending + s.balls);
  const autoRunning = useGameState((s) => s.auto?.running ?? false);
  const [betText, setBetText] = useState('1.00');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        void game.drop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);

  const locked = inFlight > 0 || autoRunning;
  return (
    <div className="dev-controls">
      <input
        value={betText}
        onChange={(e) => {
          setBetText(e.target.value);
          const cents = parseAmount(e.target.value);
          if (cents !== null) game.setBet(cents);
        }}
        inputMode="decimal"
        aria-label="Bet"
      />
      <select
        value={rows}
        disabled={locked}
        onChange={(e) => game.setRows(Number(e.target.value))}
        aria-label="Rows"
      >
        {ROW_OPTIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <select
        value={risk}
        disabled={locked}
        onChange={(e) => game.setRisk(e.target.value as Risk)}
        aria-label="Risk"
      >
        {RISKS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => void game.drop()} disabled={autoRunning}>
        Drop ({inFlight})
      </button>
      <button
        type="button"
        onClick={() =>
          autoRunning
            ? game.stopAuto()
            : game.startAuto({
                rounds: 0,
                intervalMs: 150,
                stopOnProfit: null,
                stopOnLoss: null,
                stopOnMultiplier: null,
              })
        }
      >
        {autoRunning ? 'Stop' : 'Auto'}
      </button>
    </div>
  );
}
