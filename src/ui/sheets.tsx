import { useState } from 'react';
import { formatMultiplier } from '../board/theme';
import { AUTO_MAX_INTERVAL, AUTO_MIN_INTERVAL, type AutoConfig } from '../core/auto';
import { validateBet } from '../core/bet';
import type { Skin } from '../core/storage';
import { formatCents, parseAmount } from '../core/money';
import { useI18n } from '../i18n/context';
import { LANGS, type Dictionary } from '../i18n/dictionaries';
import { haptics } from '../platform/telegram';
import { useApp } from './app-context';
import { binTint } from './format';
import { useGame, useGameState } from './game-context';
import { Sheet } from './Sheet';

const SKINS: readonly Skin[] = ['guitar', 'minimal'];

const RISK_SHORT: Record<string, keyof Dictionary> = {
  low: 'riskLow',
  medium: 'riskMedium',
  high: 'riskHigh',
};

const PAGE_SIZE = 10;

export function HistorySheet({ onClose }: { onClose: () => void }) {
  const { t, money, lang } = useI18n();
  const history = useGameState((s) => s.history);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const from = current * PAGE_SIZE;
  const rows = history.slice(from, from + PAGE_SIZE);
  // aria-disabled instead of disabled: a disabled button drops the focus to <body> when
  // "next" reaches the last page.
  const turn = (to: number) => {
    if (to >= 0 && to < pages) setPage(to);
  };
  const time = new Intl.DateTimeFormat(lang, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  return (
    <Sheet title={t.history} onClose={onClose}>
      {history.length === 0 ? (
        <p className="muted">{t.historyEmpty}</p>
      ) : (
        <>
          <table className="history">
            <thead>
              <tr>
                <th scope="col">{t.historyTime}</th>
                <th scope="col" className="num">
                  {t.historyBet}
                </th>
                <th scope="col" className="mid">
                  {t.historyGame}
                </th>
                <th scope="col" className="mid">
                  <abbr title={t.historyMultFull}>{t.historyMult}</abbr>
                </th>
                <th scope="col" className="num">
                  {t.historyPayout}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const win = h.multiplier >= 1;
                return (
                  <tr key={h.id}>
                    <td className="history__time">
                      <time dateTime={new Date(h.time).toISOString()}>{time.format(h.time)}</time>
                    </td>
                    <td className="num">{money(h.bet)}</td>
                    <td className="history__game mid">
                      {h.rows} · {t[RISK_SHORT[h.risk] ?? 'riskMedium']}
                    </td>
                    <td className="mid">
                      <span
                        className={`mult-chip ${win ? 'mult-chip--win' : 'mult-chip--loss'}`}
                        style={win ? { background: binTint(h) } : undefined}
                      >
                        {formatMultiplier(h.multiplier, true)}
                      </span>
                    </td>
                    <td
                      className={`num ${h.payout > h.bet ? 'win' : h.payout < h.bet ? 'loss' : ''}`}
                    >
                      {money(h.payout)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="sr-only" aria-live="polite">
            {t.historyRange
              .replace('{from}', String(from + 1))
              .replace('{to}', String(from + rows.length))
              .replace('{total}', String(history.length))}
          </p>
          {pages > 1 && (
            <nav className="pager" aria-label={t.historyPages}>
              <button
                type="button"
                className="pager__btn"
                aria-label={t.historyPrev}
                aria-disabled={current === 0}
                onClick={() => turn(current - 1)}
              >
                ‹
              </button>
              {Array.from({ length: pages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className="pager__btn"
                  aria-label={t.historyPage.replace('{n}', String(i + 1))}
                  aria-current={i === current ? 'page' : undefined}
                  onClick={() => turn(i)}
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button"
                className="pager__btn"
                aria-label={t.historyNext}
                aria-disabled={current === pages - 1}
                onClick={() => turn(current + 1)}
              >
                ›
              </button>
            </nav>
          )}
        </>
      )}
    </Sheet>
  );
}

export function MenuSheet({ onClose, onRules }: { onClose: () => void; onRules: () => void }) {
  const { t, lang } = useI18n();
  const { prefs, updatePrefs } = useApp();
  const game = useGame();
  const busy = useGameState((s) => s.pending + s.balls > 0 || (s.auto?.running ?? false));
  const [confirm, setConfirm] = useState(false);

  return (
    <Sheet title={t.menu} onClose={onClose}>
      <div className="menu">
        <div className="field">
          <span className="field__label" id="lang-label">
            {t.language}
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="lang-label">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={lang === l}
                className="segmented__item segmented__item--medium"
                onClick={() => {
                  haptics.select();
                  updatePrefs({ lang: l });
                }}
              >
                {l === 'ru' ? 'Русский' : 'English'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label" id="skin-label">
            {t.design}
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="skin-label">
            {SKINS.map((skin) => (
              <button
                key={skin}
                type="button"
                role="radio"
                aria-checked={prefs.skin === skin}
                className="segmented__item segmented__item--medium"
                onClick={() => {
                  haptics.select();
                  updatePrefs({ skin });
                }}
              >
                {skin === 'guitar' ? t.skinGuitar : t.skinMinimal}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="menu__item" onClick={onRules}>
          {t.howToPlay}
        </button>

        {confirm ? (
          <div className="menu__confirm">
            <p>{t.resetConfirm}</p>
            <div className="menu__confirm-row">
              <button type="button" className="chip" onClick={() => setConfirm(false)}>
                {t.resetCancel}
              </button>
              <button
                type="button"
                className="chip chip--danger"
                disabled={busy}
                onClick={() => {
                  if (game.resetBalance()) {
                    setConfirm(false);
                    onClose();
                  }
                }}
              >
                {t.resetYes}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="menu__item menu__item--danger"
            disabled={busy}
            title={busy ? t.resetLocked : undefined}
            onClick={() => setConfirm(true)}
          >
            {t.resetBalance}
          </button>
        )}
        {busy && <p className="muted small">{t.resetLocked}</p>}
      </div>
    </Sheet>
  );
}

const fromInput = (text: string) => {
  const cents = parseAmount(text);
  return cents === null || cents === 0 ? null : cents;
};
const toInput = (cents: number | null) =>
  cents === null ? '' : formatCents(cents, { group: '', decimal: '.' });

export function AutoSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { prefs, updatePrefs } = useApp();
  const game = useGame();
  const bet = useGameState((s) => s.bet);
  const balance = useGameState((s) => s.balance);
  const [rounds, setRounds] = useState(String(prefs.auto.rounds));
  const [interval, setIntervalMs] = useState(prefs.auto.intervalMs);
  const [profit, setProfit] = useState(toInput(prefs.auto.stopOnProfit));
  const [loss, setLoss] = useState(toInput(prefs.auto.stopOnLoss));
  // Multiplier entered as "10" or "2.5": parse like money, then cents → value.
  const [mult, setMult] = useState(
    prefs.auto.stopOnMultiplier === null ? '' : String(prefs.auto.stopOnMultiplier),
  );

  const roundsValid = /^\d{1,6}$/.test(rounds.trim());
  const profitValid = profit.trim() === '' || parseAmount(profit) !== null;
  const lossValid = loss.trim() === '' || parseAmount(loss) !== null;
  const multValid = mult.trim() === '' || parseAmount(mult) !== null;
  const betError = validateBet(bet, balance);
  const valid = roundsValid && profitValid && lossValid && multValid && betError === null;

  const start = () => {
    if (!valid) return;
    const multCents = fromInput(mult);
    const config: AutoConfig = {
      rounds: Number(rounds.trim()),
      intervalMs: interval,
      stopOnProfit: fromInput(profit),
      stopOnLoss: fromInput(loss),
      stopOnMultiplier: multCents === null ? null : multCents / 100,
    };
    updatePrefs({ auto: config });
    if (game.startAuto(config)) {
      haptics.impact('medium');
      onClose();
    }
  };

  return (
    <Sheet title={t.autoTitle} onClose={onClose}>
      <form
        className="auto-form"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <label className="field">
          <span className="field__label">
            {t.autoRounds} <span className="field__hint">{t.autoRoundsHint}</span>
          </span>
          <span className={`input ${roundsValid ? '' : 'input--error'}`}>
            <input
              value={rounds}
              inputMode="numeric"
              onChange={(e) => setRounds(e.target.value)}
              aria-invalid={!roundsValid}
            />
            <span className="input__suffix">{rounds.trim() === '0' ? '∞' : ''}</span>
          </span>
        </label>

        <label className="field">
          <span className="field__label">
            {t.autoSpeed}
            <span className="field__value">
              {(interval / 1000).toFixed(2)} {t.autoSeconds}
            </span>
          </span>
          <input
            className="range"
            type="range"
            min={AUTO_MIN_INTERVAL}
            max={AUTO_MAX_INTERVAL}
            step={50}
            value={interval}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
          />
        </label>

        <div className="auto-form__stops">
          <StopField
            label={t.autoStopProfit}
            suffix="RC"
            value={profit}
            onChange={setProfit}
            valid={profitValid}
          />
          <StopField
            label={t.autoStopLoss}
            suffix="RC"
            value={loss}
            onChange={setLoss}
            valid={lossValid}
          />
          <StopField
            label={t.autoStopWin}
            suffix="×"
            value={mult}
            onChange={setMult}
            valid={multValid}
          />
        </div>

        {betError && <p className="field__error">{t.errorInsufficient}</p>}

        <button type="submit" className="drop-btn" disabled={!valid}>
          <span className="drop-btn__label">{t.autoStart}</span>
        </button>
      </form>
    </Sheet>
  );
}

function StopField(props: {
  label: string;
  suffix: string;
  value: string;
  valid: boolean;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  return (
    <label className="field">
      <span className="field__label">{props.label}</span>
      <span className={`input ${props.valid ? '' : 'input--error'}`}>
        <input
          value={props.value}
          inputMode="decimal"
          placeholder={t.autoOff}
          onChange={(e) => props.onChange(e.target.value)}
          aria-invalid={!props.valid}
        />
        <span className="input__suffix">{props.suffix}</span>
      </span>
    </label>
  );
}
