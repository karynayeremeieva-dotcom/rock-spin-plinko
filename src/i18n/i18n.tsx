import { useEffect, useMemo, type ReactNode } from 'react';
import { formatCents } from '../core/money';
import { I18nContext, type I18n } from './context';
import { DICTIONARIES, NUMBER_FORMAT, type Lang } from './dictionaries';

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo<I18n>(
    () => ({
      lang,
      t: DICTIONARIES[lang],
      money: (cents) => formatCents(cents, NUMBER_FORMAT[lang]),
    }),
    [lang],
  );
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
