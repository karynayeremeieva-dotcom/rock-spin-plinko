/**
 * localStorage persistence. Everything read back is validated: a corrupted or
 * hand-edited save falls back to defaults instead of breaking the game.
 */
import { normalizeAutoConfig, type AutoConfig } from './auto';
import { MAX_BET } from './bet';
import { calcPayout } from './money';
import { HISTORY_LIMIT, type HistoryEntry, type PersistedGame } from './game';
import { isRisk, isRows } from './multipliers';

export const STORAGE_KEY = 'rockspin.plinko.v1';

/**
 * Save key. Inside Telegram it carries the user id, so two accounts on one phone
 * (Telegram's web view shares storage between them) never share a balance.
 */
export function saveKey(telegramUserId: string | null): string {
  return telegramUserId ? `${STORAGE_KEY}.tg${telegramUserId}` : STORAGE_KEY;
}

export type Lang = 'ru' | 'en';

/** Two board designs: a V-shaped guitar body or a minimalist glass triangle. */
export type Skin = 'guitar' | 'minimal';

export const isSkin = (v: unknown): v is Skin => v === 'guitar' || v === 'minimal';

export interface Prefs {
  sound: boolean;
  /** null = detect from Telegram / browser. */
  lang: Lang | null;
  skin: Skin;
  auto: AutoConfig;
}

export const DEFAULT_AUTO: AutoConfig = {
  rounds: 10,
  intervalMs: 400,
  stopOnProfit: null,
  stopOnLoss: null,
  stopOnMultiplier: null,
};

export const DEFAULT_PREFS: Prefs = { sound: true, lang: null, skin: 'guitar', auto: DEFAULT_AUTO };

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

export function loadSave(storage: Storage | null, key = STORAGE_KEY): SaveData {
  const empty: SaveData = { game: {}, prefs: DEFAULT_PREFS };
  if (!storage) return empty;
  migrateLegacySave(storage, key);
  let raw: unknown;
  try {
    raw = JSON.parse(storage.getItem(key) ?? 'null');
  } catch {
    return empty;
  }
  if (!isObject(raw)) return empty;
  return { game: parseGame(raw.game), prefs: parsePrefs(raw.prefs) };
}

export function writeSave(
  storage: Storage | null,
  data: { game: PersistedGame; prefs: Prefs },
  key = STORAGE_KEY,
) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(data));
  } catch {
    // Quota exceeded or storage revoked: the game keeps working in memory.
  }
}

/**
 * Saves made before the key carried the Telegram user id move to the user's own key on
 * their first visit, once: the first account to open the game keeps its progress, any
 * later account starts fresh.
 */
function migrateLegacySave(storage: Storage, key: string) {
  if (key === STORAGE_KEY) return;
  try {
    const legacy = storage.getItem(STORAGE_KEY);
    if (legacy === null) return;
    if (storage.getItem(key) === null) storage.setItem(key, legacy);
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Storage revoked mid-way: the game simply starts from what it could read.
  }
}

function parseGame(value: unknown): Partial<PersistedGame> {
  if (!isObject(value)) return {};
  const out: Partial<PersistedGame> = {};
  if (isCents(value.balance)) out.balance = value.balance;
  if (isCents(value.bet) && value.bet <= MAX_BET) out.bet = value.bet;
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
    skin: isSkin(value.skin) ? value.skin : DEFAULT_PREFS.skin,
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
    (value.bin as number) >= 0 &&
    (value.bin as number) <= value.rows &&
    typeof value.multiplier === 'number' &&
    Number.isFinite(value.multiplier) &&
    value.multiplier > 0 &&
    isCents(value.payout) &&
    // A record must add up: an edited or corrupted entry is dropped, not shown.
    value.payout === calcPayout(value.bet, value.multiplier)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCents(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
