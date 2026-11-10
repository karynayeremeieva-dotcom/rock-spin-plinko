import { createContext, useContext } from 'react';
import type { Cents } from '../core/money';
import type { Dictionary, Lang } from './dictionaries';

export interface I18n {
  lang: Lang;
  t: Dictionary;
  money: (cents: Cents) => string;
}

export const I18nContext = createContext<I18n | null>(null);

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
