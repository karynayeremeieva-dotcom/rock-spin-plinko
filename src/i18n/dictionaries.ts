export const LANGS = ['ru', 'en'] as const;
export type Lang = (typeof LANGS)[number];

const ru = {
  brand: 'Rock Spin',
  balance: 'Баланс',
  bet: 'Ставка',
  rows: 'Ряды',
  risk: 'Риск',
  riskLow: 'Низкий',
  riskMedium: 'Средний',
  riskHigh: 'Высокий',
  drop: 'Бросить',
  dropHint: 'Пробел',
  half: '½',
  double: '×2',
  max: 'Макс',
  lockedHint: 'Дождитесь, пока шарики долетят',
  ballsInFlight: 'В полёте',
  ballsLimit: 'Не больше 50 шариков',
  errorInvalid: 'Введите сумму',
  errorBelowMin: 'Минимум 0.10 RC',
  errorAboveMax: 'Максимум 1 000 RC',
  errorInsufficient: 'Не хватает баланса',
  errorNetwork: 'Сервер не ответил, ставка возвращена',
  recent: 'Последние броски',
  noResults: 'Здесь появятся результаты',
  tooltipChance: 'Шанс',
  tooltipWin: 'Выигрыш',
  decreaseRows: 'Меньше рядов',
  increaseRows: 'Больше рядов',
  loading: 'Загрузка',
} as const;

export type Dictionary = { readonly [K in keyof typeof ru]: string };

const en: Dictionary = {
  brand: 'Rock Spin',
  balance: 'Balance',
  bet: 'Bet',
  rows: 'Rows',
  risk: 'Risk',
  riskLow: 'Low',
  riskMedium: 'Medium',
  riskHigh: 'High',
  drop: 'Drop',
  dropHint: 'Space',
  half: '½',
  double: '×2',
  max: 'Max',
  lockedHint: 'Wait for the balls to land',
  ballsInFlight: 'In flight',
  ballsLimit: 'Up to 50 balls at once',
  errorInvalid: 'Enter an amount',
  errorBelowMin: 'Minimum 0.10 RC',
  errorAboveMax: 'Maximum 1,000 RC',
  errorInsufficient: 'Not enough balance',
  errorNetwork: 'Server did not respond, bet returned',
  recent: 'Recent drops',
  noResults: 'Results will appear here',
  tooltipChance: 'Chance',
  tooltipWin: 'Win',
  decreaseRows: 'Fewer rows',
  increaseRows: 'More rows',
  loading: 'Loading',
};

export const DICTIONARIES: Record<Lang, Dictionary> = { ru, en };

/** Thousands separator and decimal point per language. */
export const NUMBER_FORMAT: Record<Lang, { group: string; decimal: string }> = {
  ru: { group: '\u00a0', decimal: '.' },
  en: { group: ',', decimal: '.' },
};

export function detectLang(): Lang {
  const tg = (
    window as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } }
  ).Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  const code = (tg ?? navigator.language ?? 'en').toLowerCase();
  return /^(ru|uk|be|kk)/.test(code) ? 'ru' : 'en';
}
