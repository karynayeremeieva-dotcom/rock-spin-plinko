/**
 * Hidden multiplier editor, opened with ?dev=1. Loaded as a separate chunk, so players
 * never download it. Edits a draft of all 27 tables; "Apply" swaps the live config used by
 * the fake server and the board, "Download JSON" produces a ready src/config/multipliers.json.
 */
import { useMemo, useRef, useState } from 'react';
import {
  assertConfig,
  binProbabilities,
  calcRtp,
  DEFAULT_CONFIG,
  formatConfig,
  getConfig,
  RISKS,
  ROW_OPTIONS,
  setConfig,
  validateTable,
  type MultiplierConfig,
  type Risk,
} from '../core/multipliers';
import { simulate, type SimulationResult } from '../core/simulate';
import { useI18n } from '../i18n/context';
import type { Dictionary } from '../i18n/dictionaries';
import { useApp } from '../ui/app-context';
import { formatPercent } from '../ui/format';
import { useGameState } from '../ui/game-context';
import { Sheet } from '../ui/Sheet';

type Draft = Record<string, Record<Risk, string[]>>;

const RISK_LABELS: Record<Risk, keyof Dictionary> = {
  low: 'riskLow',
  medium: 'riskMedium',
  high: 'riskHigh',
};

const NUMBER_RE = /^\d+(\.\d{1,2})?$/;

function toDraft(config: MultiplierConfig): Draft {
  const draft: Draft = {};
  for (const rows of ROW_OPTIONS) {
    const byRisk = config[String(rows)];
    draft[rows] = {
      low: (byRisk?.low ?? []).map(String),
      medium: (byRisk?.medium ?? []).map(String),
      high: (byRisk?.high ?? []).map(String),
    };
  }
  return draft;
}

/** Parsed table, with NaN where the text is not a valid multiplier. */
const parse = (values: readonly string[]) =>
  values.map((v) => (NUMBER_RE.test(v.trim()) ? Number(v.trim()) : Number.NaN));

function fromDraft(draft: Draft): MultiplierConfig | null {
  const config: Record<string, Record<Risk, number[]>> = {};
  for (const rows of ROW_OPTIONS) {
    const byRisk = draft[rows];
    if (!byRisk) return null;
    config[rows] = {
      low: parse(byRisk.low),
      medium: parse(byRisk.medium),
      high: parse(byRisk.high),
    };
  }
  try {
    assertConfig(config);
    return config;
  } catch {
    return null;
  }
}

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

export default function DevPanel() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <>
      <button type="button" className="dev-toggle" onClick={() => setOpen(true)}>
        {t.devOpen}
      </button>
      {open && <DevSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function DevSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { notify } = useApp();
  const gameRows = useGameState((s) => s.rows);
  const gameRisk = useGameState((s) => s.risk);
  const locked = useGameState((s) => s.pending + s.balls > 0 || (s.auto?.running ?? false));

  const [draft, setDraft] = useState<Draft>(() => toDraft(getConfig()));
  const [rows, setRows] = useState(gameRows);
  const [risk, setRisk] = useState<Risk>(gameRisk);
  const [symmetric, setSymmetric] = useState(true);
  const [sim, setSim] = useState<SimulationResult | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const texts = draft[rows]?.[risk] ?? [];
  const values = parse(texts);
  const probabilities = binProbabilities(rows);
  const issues = validateTable(rows, values);
  const badValues = values.flatMap((v, i) => (Number.isNaN(v) ? [i] : []));
  const rtp = badValues.length ? Number.NaN : calcRtp(values);
  const config = useMemo(() => fromDraft(draft), [draft]);
  const editedTables = useMemo(() => {
    const original = toDraft(DEFAULT_CONFIG);
    let n = 0;
    for (const r of ROW_OPTIONS) {
      for (const k of RISKS) if (draft[r]?.[k].join() !== original[r]?.[k].join()) n++;
    }
    return n;
  }, [draft]);

  const edit = (index: number, value: string) => {
    setSim(null);
    setDraft((d) => {
      const table = [...(d[rows]?.[risk] ?? [])];
      table[index] = value;
      if (symmetric) table[rows - index] = value;
      const byRisk = d[rows];
      return byRisk ? { ...d, [rows]: { ...byRisk, [risk]: table } } : d;
    });
  };

  const warnings: string[] = [];
  if (badValues.length) warnings.push(...badValues.map((i) => fill(t.devWarnValue, { n: i })));
  const asym = issues.flatMap((i) =>
    i.kind === 'asymmetric' ? [`${i.index}↔${rows - i.index}`] : [],
  );
  if (asym.length) warnings.push(fill(t.devWarnAsym, { list: asym.join(', ') }));
  const rtpIssue = issues.find((i) => i.kind === 'rtp');
  if (rtpIssue && !badValues.length) {
    warnings.push(fill(t.devWarnRtp, { x: (rtp * 100).toFixed(3) }));
  }

  const apply = () => {
    if (!config || locked) return;
    setConfig(config);
    notify(t.devApplied);
  };

  const reset = () => {
    abortRef.current?.abort();
    setDraft(toDraft(DEFAULT_CONFIG));
    setSim(null);
    if (!locked) setConfig(DEFAULT_CONFIG);
  };

  const download = () => {
    if (!config) return;
    const url = URL.createObjectURL(new Blob([formatConfig(config)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'multipliers.json';
    a.click();
    // Safari may still be reading the blob right after click(): release it a bit later.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const runSimulation = async () => {
    if (badValues.length) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSim(null);
    setProgress(0);
    try {
      const result = await simulate(values, {
        signal: controller.signal,
        onProgress: (done, total) => setProgress(done / total),
      });
      setSim(result);
    } catch {
      // aborted: a newer run or a reset replaced it
    } finally {
      if (abortRef.current === controller) setProgress(null);
    }
  };

  return (
    <Sheet title={t.devTitle} onClose={onClose}>
      <div className="dev">
        <div className="dev__controls">
          <label className="field">
            <span className="field__label">{t.rows}</span>
            <select
              className="dev__select"
              value={rows}
              onChange={(e) => {
                setRows(Number(e.target.value));
                setSim(null);
              }}
            >
              {ROW_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span className="field__label">{t.risk}</span>
            <div className="segmented" role="radiogroup" aria-label={t.risk}>
              {RISKS.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={risk === r}
                  className={`segmented__item segmented__item--${r}`}
                  onClick={() => {
                    setRisk(r);
                    setSim(null);
                  }}
                >
                  {t[RISK_LABELS[r]]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="dev__check">
          <input
            type="checkbox"
            checked={symmetric}
            onChange={(e) => setSymmetric(e.target.checked)}
          />
          {t.devSymmetric}
        </label>

        <table className="dev__table">
          <thead>
            <tr>
              <th>{t.devBin}</th>
              <th className="num">{t.devChance}</th>
              <th>{t.devMultiplier}</th>
              <th className="num">{t.devContribution}</th>
            </tr>
          </thead>
          <tbody>
            {texts.map((text, i) => {
              const p = probabilities[i] ?? 0;
              const v = values[i] ?? Number.NaN;
              return (
                <tr key={i}>
                  <td className="muted">{i}</td>
                  <td className="num">{formatPercent(p)}</td>
                  <td>
                    <input
                      className={`dev__input ${Number.isNaN(v) ? 'dev__input--error' : ''}`}
                      value={text}
                      inputMode="decimal"
                      aria-label={`${t.devBin} ${i}`}
                      onChange={(e) => edit(i, e.target.value.replace(',', '.'))}
                    />
                  </td>
                  <td className="num">{Number.isNaN(v) ? '—' : `${(p * v * 100).toFixed(3)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className={`dev__rtp ${warnings.length ? 'dev__rtp--warn' : ''}`}>
          <span>{t.devRtp}</span>
          <b>{Number.isNaN(rtp) ? '—' : `${(rtp * 100).toFixed(3)}%`}</b>
        </div>
        <ul className="dev__warnings" aria-live="polite">
          {warnings.length === 0 ? (
            <li className="dev__ok">{t.devOk}</li>
          ) : (
            warnings.map((w) => <li key={w}>{w}</li>)
          )}
        </ul>

        <div className="dev__actions">
          <button
            type="button"
            className="chip chip--primary"
            disabled={!config || locked}
            onClick={apply}
          >
            {t.devApply}
          </button>
          <button type="button" className="chip" onClick={reset}>
            {t.devReset}
          </button>
          <button type="button" className="chip" disabled={!config} onClick={download}>
            {t.devDownload}
          </button>
        </div>
        {locked && <p className="muted small">{t.devLocked}</p>}
        {editedTables > 0 && (
          <p className="muted small">{fill(t.devEdited, { n: editedTables })}</p>
        )}

        <div className="dev__sim">
          <button
            type="button"
            className="chip chip--wide"
            disabled={badValues.length > 0 || progress !== null}
            onClick={() => void runSimulation()}
          >
            {progress !== null
              ? fill(t.devSimRunning, { n: Math.round(progress * 100) })
              : t.devSimulate}
          </button>
          {progress !== null && (
            <div className="dev__progress">
              <div style={{ width: `${progress * 100}%` }} />
            </div>
          )}
          {sim && (
            <dl className="dev__result">
              <dt>{t.devSimActual}</dt>
              <dd>{(sim.rtp * 100).toFixed(3)}%</dd>
              <dt>{t.devSimExpected}</dt>
              <dd>{(sim.expectedRtp * 100).toFixed(3)}%</dd>
              <dt>{t.devSimDiff}</dt>
              <dd>{((sim.rtp - sim.expectedRtp) * 100).toFixed(3)} pp</dd>
            </dl>
          )}
          <p className="muted small">{t.devSimNote}</p>
        </div>
      </div>
    </Sheet>
  );
}
