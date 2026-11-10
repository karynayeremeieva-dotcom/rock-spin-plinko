import { useCallback, useEffect, useState } from 'react';
import { doubleBet, halfBet, maxBet, QUICK_BETS, validateBet, type BetError } from '../core/bet';
import { MAX_BALLS } from '../core/game';
import { formatCents, parseAmount, type Cents } from '../core/money';
import { MAX_ROWS, MIN_ROWS, RISKS, type Risk } from '../core/multipliers';
import type { Dictionary } from '../i18n/dictionaries';
import { useI18n } from '../i18n/context';
import { haptics } from '../platform/telegram';
import { useGame, useGameState } from './game-context';
import { IconAuto, IconLock, IconMinus, IconPlus } from './icons';
import { AutoSheet } from './sheets';

const toInput = (cents: Cents) => formatCents(cents, { group: '', decimal: '.' });

const BET_ERRORS: Record<BetError, keyof Dictionary> = {
  invalid: 'errorInvalid',
  below_min: 'errorBelowMin',
  above_max: 'errorAboveMax',
  insufficient: 'errorInsufficient',
};

const RISK_LABELS: Record<Risk, keyof Dictionary> = {
  low: 'riskLow',
  medium: 'riskMedium',
  high: 'riskHigh',
};

export function BetPanel() {
  const { t } = useI18n();
  const game = useGame();
  const balance = useGameState((s) => s.balance);
  const bet = useGameState((s) => s.bet);
  const rows = useGameState((s) => s.rows);
  const risk = useGameState((s) => s.risk);
  const inFlight = useGameState((s) => s.pending + s.balls);
  const autoRunning = useGameState((s) => s.auto?.running ?? false);
  const [autoOpen, setAutoOpen] = useState(false);

  // The field keeps what the player typed; the engine keeps the last valid amount.
  const [text, setText] = useState(() => toInput(bet));
  const typed = parseAmount(text);
  const error = validateBet(typed, balance);
  const locked = inFlight > 0 || autoRunning;
  const full = inFlight >= MAX_BALLS;
  const canDrop = error === null && !full && !autoRunning;

  const applyBet = (cents: Cents) => {
    setText(toInput(cents));
    game.setBet(cents);
  };

  const onType = (value: string) => {
    setText(value);
    const cents = parseAmount(value);
    if (cents !== null) game.setBet(cents);
  };

  const drop = useCallback(() => {
    if (!canDrop) return;
    haptics.impact('light');
    void game.drop();
  }, [canDrop, game]);

  // Space = drop on desktop. Ignored while typing and on key repeat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      e.preventDefault(); // also stops a focused button from being "clicked" twice
      if (e.repeat) return;
      if (game.isAutoRunning) game.stopAuto();
      else drop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drop, game]);

  return (
    <section className="panel" aria-label={t.bet}>
      <div className="field">
        <label className="field__label" htmlFor="bet-input">
          {t.bet}
        </label>
        <div className="bet-row">
          <div className={`input ${error ? 'input--error' : ''}`}>
            <input
              id="bet-input"
              value={text}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={error !== null}
              aria-describedby={error ? 'bet-error' : undefined}
              onChange={(e) => onType(e.target.value)}
              onBlur={() => typed !== null && setText(toInput(typed))}
            />
            <span className="input__suffix">RC</span>
          </div>
          <button type="button" className="chip" onClick={() => applyBet(halfBet(typed ?? bet))}>
            {t.half}
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => applyBet(doubleBet(typed ?? bet, balance))}
          >
            {t.double}
          </button>
          <button type="button" className="chip" onClick={() => applyBet(maxBet(balance))}>
            {t.max}
          </button>
        </div>
        <div className="quick-row">
          {QUICK_BETS.map((amount) => (
            <button
              key={amount}
              type="button"
              className={`chip chip--small ${typed === amount ? 'chip--active' : ''}`}
              onClick={() => applyBet(amount)}
            >
              {amount / 100}
            </button>
          ))}
          <span id="bet-error" className="field__error" role="alert">
            {error ? t[BET_ERRORS[error]] : ''}
          </span>
        </div>
      </div>

      <div className="settings-row" title={locked ? t.lockedHint : undefined}>
        <div className="field field--rows">
          <span className="field__label">
            {t.rows}
            {locked && <IconLock className="field__lock" width={12} height={12} />}
          </span>
          <div className="stepper">
            <button
              type="button"
              className="stepper__btn"
              aria-label={t.decreaseRows}
              disabled={locked || rows <= MIN_ROWS}
              onClick={() => game.setRows(rows - 1)}
            >
              <IconMinus />
            </button>
            <output className="stepper__value" aria-live="polite">
              {rows}
            </output>
            <button
              type="button"
              className="stepper__btn"
              aria-label={t.increaseRows}
              disabled={locked || rows >= MAX_ROWS}
              onClick={() => game.setRows(rows + 1)}
            >
              <IconPlus />
            </button>
          </div>
        </div>

        <div className="field field--risk">
          <span className="field__label" id="risk-label">
            {t.risk}
            {locked && <IconLock className="field__lock" width={12} height={12} />}
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="risk-label">
            {RISKS.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={risk === r}
                className={`segmented__item segmented__item--${r}`}
                disabled={locked}
                onClick={() => game.setRisk(r)}
              >
                {t[RISK_LABELS[r]]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="action-row">
        <button
          type="button"
          className="auto-btn"
          disabled={autoRunning || error !== null}
          onClick={() => setAutoOpen(true)}
        >
          <IconAuto />
          <span>{t.auto}</span>
        </button>
        {autoRunning ? (
          <AutoRunningButton />
        ) : (
          <button
            type="button"
            className="drop-btn"
            disabled={!canDrop}
            onClick={drop}
            title={full ? t.ballsLimit : undefined}
          >
            <span className="drop-btn__label">{t.drop}</span>
            <span className="drop-btn__hint">{t.dropHint}</span>
            {inFlight > 0 && (
              <span className="drop-btn__count" aria-label={t.ballsInFlight}>
                {inFlight}
              </span>
            )}
          </button>
        )}
      </div>
      {autoOpen && <AutoSheet onClose={() => setAutoOpen(false)} />}
    </section>
  );
}

/** While auto mode runs the main button is Stop, with rounds left and session profit. */
function AutoRunningButton() {
  const { t, money } = useI18n();
  const game = useGame();
  const left = useGameState((s) =>
    s.auto && s.auto.config.rounds > 0
      ? Math.max(0, s.auto.config.rounds - s.auto.progress.launched)
      : null,
  );
  const profit = useGameState((s) => s.auto?.progress.profit ?? 0);

  return (
    <button type="button" className="drop-btn drop-btn--stop" onClick={() => game.stopAuto()}>
      <span className="drop-btn__label">{t.autoStop}</span>
      <span className="drop-btn__stats">
        <span>
          {t.autoLeft}: <b>{left === null ? '∞' : left}</b>
        </span>
        <span className={profit > 0 ? 'win' : profit < 0 ? 'loss' : ''}>
          {t.autoProfit}:{' '}
          <b>
            {profit >= 0 ? '+' : '−'}
            {money(Math.abs(profit))}
          </b>
        </span>
      </span>
    </button>
  );
}
