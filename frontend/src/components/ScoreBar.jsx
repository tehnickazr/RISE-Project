/**
 * A score on the platform's 1–5 scale, with a bar for scanning a column of them
 * and an optional delta against the previous attempt at the same scenario.
 *
 * Bands are deliberately coarse — under 2.5, under 3.5, above — because the
 * model's scores are not precise enough to justify finer shading, and a teacher
 * reading a table wants "weak / middling / strong", not a gradient.
 */
export function scoreBand(score) {
  if (score == null) return '';
  if (score < 2.5) return 'is-low';
  if (score < 3.5) return 'is-mid';
  return 'is-high';
}

export function formatScore(score, locale) {
  if (score == null) return '—';
  return Number(score).toFixed(2).replace('.', String(locale).startsWith('en') ? '.' : ',');
}

export default function ScoreBar({ score, delta = null, locale = 'en', deltaTitle }) {
  if (score == null) return <span className="score-empty">—</span>;
  const value = Number(score);
  const deltaKind = delta == null
    ? null
    : delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
  return (
    <span className={`score ${scoreBand(value)}`}>
      <b>{formatScore(value, locale)}</b>
      <span className="score-track">
        <i style={{ width: `${Math.max(0, Math.min(100, (value / 5) * 100)).toFixed(0)}%` }} />
      </span>
      {deltaKind && (
        <span className={`score-delta ${deltaKind}`} title={deltaTitle}>
          {delta > 0 ? '+' : ''}{formatScore(delta, locale)}
        </span>
      )}
    </span>
  );
}
