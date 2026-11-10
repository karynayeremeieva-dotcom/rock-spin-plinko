/**
 * localStorage persistence. Everything read back is validated: a corrupted or
 * hand-edited save falls back to defaults instead of breaking the game.
 */
import { normalizeAutoConfig, type AutoConfig } from './auto';
import { HISTORY_LIMIT, type HistoryEntry, type PersistedGame } from './game';
import { isRisk, isRows } from './multipliers';

export const STORAGE_KEY = 'rockspin.plinko.v1';

export type Lang = 'ru' | 'en';

export interface Prefs {
  sound: boolean;
  /** null = detect from Telegram / browser. */
  lang: Lang | null;
  auto: AutoConfig;
}

export const DEFAULT_AUTO: AutoConfig = {
  rounds: 10,
  intervalMs: 400,
  stopOnProfit: null,
  stopOnLoss: null,
  stopOnMultiplier: null,
};

export const DEFAULT_PREFS: Prefs = { sound: true, lang: null, auto: DEFAULT_AUTO };

export interface SaveData {
  game: Partial<PersistedGame>;
  prefs: Prefs;
}

/** localStorage, or null if it is unavailable (private mode, blocked cookies, …). */
export function safeStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    const probe = '__rs_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function loadSave(storage: Storage | null): SaveData {
  const empty: SaveData = { game: {}, prefs: DEFAULT_PREFS };
  if (!storage) return empty;
  let raw: unknown;
  try {
    raw = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return empty;
  }
  if (!isObject(raw)) return empty;
  return { game: parseGame(raw.game), prefs: parsePrefs(raw.prefs) };
}

export function writeSave(storage: Storage | null, data: { game: PersistedGame; prefs: Prefs }) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded or storage revoked: the game keeps working in memory.
  }
}

function parseGame(value: unknown): Partial<PersistedGame> {
  if (!isObject(value)) return {};
  const out: Partial<PersistedGame> = {};
  if (isCents(value.balance)) out.balance = value.balance;
  if (isCents(value.bet)) out.bet = value.bet;
  if (isRows(value.rows)) out.rows = value.rows;
  if (isRisk(value.risk)) out.risk = value.risk;
  if (Array.isArray(value.history)) {
    out.history = value.history.filter(isHistoryEntry).slice(0, HISTORY_LIMIT);
  }
  return out;
}

function parsePrefs(value: unknown): Prefs {
  if (!isObject(value)) return DEFAULT_PREFS;
  const auto = isObject(value.auto) ? value.auto : {};
  const num = (v: unknown, fallback: number | null) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return {
    sound: typeof value.sound === 'boolean' ? value.sound : DEFAULT_PREFS.sound,
    lang: value.lang === 'ru' || value.lang === 'en' ? value.lang : null,
    auto: normalizeAutoConfig({
      rounds: num(auto.rounds, DEFAULT_AUTO.rounds) ?? DEFAULT_AUTO.rounds,
      intervalMs: num(auto.intervalMs, DEFAULT_AUTO.intervalMs) ?? DEFAULT_AUTO.intervalMs,
      stopOnProfit: num(auto.stopOnProfit, null),
      stopOnLoss: num(auto.stopOnLoss, null),
      stopOnMultiplier: num(auto.stopOnMultiplier, null),
    }),
  };
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.time === 'number' &&
    isCents(value.bet) &&
    isRows(value.rows) &&
    isRisk(value.risk) &&
    Number.isInteger(value.bin) &&
    typeof value.multiplier === 'number' &&
    isCents(value.payout)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCents(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
