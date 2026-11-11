import { formatMultiplier } from '../board/theme';
import { useI18n } from '../i18n/context';
import { binTint } from './format';
import { useGameState } from './game-context';

const FEED_SIZE = 15;

export function ResultsFeed() {
  const { t } = useI18n();
  const history = useGameState((s) => s.history);
  const recent = history.slice(0, FEED_SIZE);

  return (
    <ol className="feed" aria-label={t.recent}>
      {recent.length === 0 && <li className="feed__empty">{t.noResults}</li>}
      {recent.map((entry) => (
        <li key={entry.id} className="feed__chip" style={{ ['--tint' as string]: binTint(entry) }}>
          {formatMultiplier(entry.multiplier, true)}
        </li>
      ))}
    </ol>
  );
}
