import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useT, dateLocale } from '../i18n/index.js';
import { useAuth } from '../auth/AuthContext.jsx';

/**
 * The statistics page, for both scopes.
 *
 * `scope="platform"` reports on every school and shows the cross-school
 * breakdown; `scope="organization"` reports on the administrator's own and
 * does not. The server decides the scope from the actor — this prop only picks
 * which endpoint to call, and cannot widen anybody's access.
 *
 * Everything here is an aggregate. There is no drill-down to a student, because
 * there is no endpoint that would answer one.
 */
export default function Statistics({ scope }) {
  const t = useT();
  const { user } = useAuth();
  const locale = dateLocale(user?.preferred_language);
  const s = t.statistics;

  const [period, setPeriod] = useState({ key: 'all' });
  const [draft, setDraft] = useState(() => defaultRange());
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api
      .statistics(scope, period)
      .then((data) => live && (setReport(data), setError('')))
      .catch((err) => live && setError(err.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [scope, period]);

  // Numbers the way all three partner countries write them: comma for the
  // decimal. Intl already knows this; the point is to ask it, rather than
  // format in English and translate the words around it.
  const nf = useCallback(
    (v, dp = 0) =>
      v === null || v === undefined
        ? '—'
        : new Intl.NumberFormat(locale, {
            minimumFractionDigits: dp,
            maximumFractionDigits: dp,
          }).format(v),
    [locale]
  );
  const money = useCallback(
    (v) =>
      new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(v ?? 0),
    [locale]
  );
  const percent = useCallback(
    (v) =>
      v === null || v === undefined
        ? '—'
        : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(v),
    [locale]
  );
  const date = useCallback(
    (iso) =>
      iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) : null,
    [locale]
  );

  if (error) return <p className="error">{error}</p>;
  if (loading && !report) return <p className="muted">{s.loading}</p>;
  if (!report) return null;

  const { activity, utilisation, progress } = report;
  const periodLabel = report.period.start
    ? `${date(report.period.start)} – ${date(report.period.end)}`
    : s.sinceTheBeginning;

  return (
    <div className="statistics">
      {/* A select, not a second row of tabs.
          The section tabs above use the same segmented control, and two of
          them stacked read as two levels of navigation — when the second one
          is a filter. A select looks like a filter and nothing else. */}
      <div className="stats-periodrow settings-form">
        <label className="stats-period-picker">
          <span>{s.period}</span>
          <select
            value={period.key}
            onChange={(e) =>
              setPeriod(e.target.value === 'custom' ? { key: 'custom', ...draft } : { key: e.target.value })
            }
          >
            <option value="d7">{s.periods.d7}</option>
            <option value="d30">{s.periods.d30}</option>
            <option value="all">{s.periods.all}</option>
            <option value="custom">{s.periods.custom}</option>
          </select>
        </label>

        {period.key === 'custom' && (
          <>
            <label>
              <span>{s.from}</span>
              <input
                type="date"
                value={draft.from}
                max={draft.to}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              />
            </label>
            <label>
              <span>{s.to}</span>
              <input
                type="date"
                value={draft.to}
                min={draft.from}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              />
            </label>
            <button
              type="button"
              className="button primary"
              onClick={() => setPeriod({ key: 'custom', ...draft })}
            >
              {s.apply}
            </button>
          </>
        )}

        <a
          className="button secondary stats-download"
          href={api.statisticsExportUrl(scope, period)}
          // A plain link rather than a fetch: the browser saves the file, the
          // session cookie goes with it, and nothing is held in memory.
          download
        >
          {s.download}
        </a>
      </div>

      <p className="panel-hint stats-period-label">
        <strong>{s.showing}</strong> {periodLabel}
      </p>

      {/* ---------------- activity ---------------- */}
      <h2>{s.activity.title}</h2>
      <div className="stat-cards">
        <Card label={s.activity.completed} value={nf(activity.completed)}>
          {activity.change?.completed != null
            ? s.activity.versusPrevious(signedPercent(activity.change.completed, locale))
            : s.activity.wholePeriod}
        </Card>
        <Card label={s.activity.started} value={nf(activity.started)}>
          {s.activity.stillOpen(nf(activity.in_progress))}
        </Card>
        <Card label={s.activity.students} value={nf(activity.accounts.student)}>
          {s.activity.newAccounts(nf(activity.accounts.new_students))}
        </Card>
        <Card label={s.activity.staff} value={nf(activity.accounts.staff)}>
          {s.activity.staffSplit(nf(activity.accounts.teacher), nf(activity.accounts.admin))}
        </Card>
        <Card label={s.activity.practised} value={nf(activity.practised)}>
          {activity.accounts.student
            ? percent(activity.practised / activity.accounts.student)
            : '—'}
        </Card>
      </div>

      {activity.by_school && (
        <section className="panel">
          <h3>{s.activity.bySchool}</h3>
          <p className="panel-hint">{s.activity.bySchoolHint}</p>
          <table className="sessions-table">
            <thead>
              <tr>
                <th>{s.activity.school}</th>
                <th>{s.activity.country}</th>
                <th className="num">{s.activity.students}</th>
                <th className="num">{s.activity.practised}</th>
                <th className="num">{s.activity.started}</th>
                <th className="num">{s.activity.completed}</th>
              </tr>
            </thead>
            <tbody>
              {activity.by_school.map((o) => (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td>{o.country ?? '—'}</td>
                  <td className="num">{nf(o.students)}</td>
                  <td className="num">{nf(o.practised)}</td>
                  <td className="num">{nf(o.started)}</td>
                  <td className="num">{nf(o.completed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="panel">
        <h3>{s.activity.trend[activity.trend.granularity]}</h3>
        {activity.trend.buckets.length === 0 ? (
          <p className="muted">{s.activity.noInterviews}</p>
        ) : (
          <Trend
            buckets={activity.trend.buckets}
            granularity={activity.trend.granularity}
            locale={locale}
            nf={nf}
          />
        )}
      </section>

      <section className="panel">
        <h3>{s.activity.answerMode}</h3>
        <p className="panel-hint">{s.activity.answerModeHint}</p>
        {activity.answers.answers === 0 ? (
          <p className="muted">{s.activity.noAnswers}</p>
        ) : (
          <>
            <Bar
              label={s.activity.typed}
              share={activity.answers.typed / activity.answers.answers}
              value={percent(activity.answers.typed / activity.answers.answers)}
            />
            <Bar
              label={s.activity.dictated}
              share={activity.answers.dictated / activity.answers.answers}
              value={percent(activity.answers.dictated / activity.answers.answers)}
            />
          </>
        )}
      </section>

      {/* ---------------- utilisation ---------------- */}
      <h2>{s.utilisation.title}</h2>
      <p className="panel-hint">{s.utilisation.intro}</p>

      <section className="panel">
        <table className="sessions-table">
          <thead>
            <tr>
              <th />
              <th className="num">{s.utilisation.thisPeriod}</th>
              <th className="num">{s.utilisation.previousPeriod}</th>
              <th className="num">{s.utilisation.change}</th>
            </tr>
          </thead>
          <tbody>
            <UtilRow label={s.utilisation.calls} now={utilisation.llm_calls}
              was={utilisation.previous?.llm_calls} change={utilisation.change?.calls} fmt={nf} locale={locale} />
            <UtilRow label={s.utilisation.tokensIn} now={utilisation.tokens_in}
              was={utilisation.previous?.tokens_in} change={utilisation.change?.tokens_in} fmt={nf} locale={locale} />
            <UtilRow label={s.utilisation.tokensOut} now={utilisation.tokens_out}
              was={utilisation.previous?.tokens_out} change={utilisation.change?.tokens_out} fmt={nf} locale={locale} />
            <UtilRow label={s.utilisation.transcription} now={utilisation.transcription_seconds}
              was={utilisation.previous?.transcription_seconds}
              change={utilisation.change?.transcription_seconds}
              fmt={(v) => duration(v, s)} locale={locale} />
          </tbody>
          <tfoot>
            <UtilRow label={s.utilisation.cost} now={utilisation.cost_eur}
              was={utilisation.previous?.cost_eur} change={utilisation.change?.cost_eur}
              fmt={money} locale={locale} />
          </tfoot>
        </table>
        <p className="field-hint">{s.utilisation.pricingNote}</p>
      </section>

      <section className="panel">
        <h3>{s.utilisation.environment}</h3>
        <p className="panel-hint">{s.utilisation.environmentHint}</p>
        <div className="stat-cards compact">
          <Card label={s.utilisation.co2e} value={`${nf(utilisation.co2e_g, 2)} g`} />
          <Card label={s.utilisation.water} value={`${nf(utilisation.water_ml, 2)} ml`} />
          {activity.completed > 0 && (
            <>
              <Card label={s.utilisation.co2ePer}
                value={`${nf(utilisation.co2e_g / activity.completed, 3)} g`} />
              <Card label={s.utilisation.costPer}
                value={money(utilisation.cost_eur / activity.completed)} />
            </>
          )}
        </div>
      </section>

      {/* ---------------- progress ---------------- */}
      <h2>{s.progress.title}</h2>
      <p className="panel-hint">{s.progress.windowNote}</p>
      <p className="panel-hint warning-note">{s.progress.caveat}</p>

      {progress.total.students === 0 ? (
        <section className="panel">
          <p className="muted">{s.progress.nobodyYet}</p>
        </section>
      ) : (
        <>
          <div className="stat-cards">
            <Card label={s.progress.measurable} value={nf(progress.total.students)}>
              {s.progress.measurableHint}
            </Card>
            {progress.total.suppressed ? (
              <Card label={s.progress.scores} value="—">
                {s.progress.withheld}
              </Card>
            ) : (
              <>
                <Card label={s.progress.first} value={nf(progress.total.first_score, 2)} />
                <Card label={s.progress.latest} value={nf(progress.total.latest_score, 2)}>
                  <Delta value={progress.total.latest_score - progress.total.first_score} locale={locale} />
                </Card>
                <Card label={s.progress.improved}
                  value={percent(progress.total.improved / progress.total.students)}>
                  {s.progress.improvedSplit(
                    nf(progress.total.improved),
                    nf(progress.total.unchanged),
                    nf(progress.total.declined)
                  )}
                </Card>
              </>
            )}
          </div>

          <section className="panel">
            <h3>{s.progress.byCompetency}</h3>
            <p className="panel-hint">{s.progress.byCompetencyHint}</p>
            {progress.by_competency.length === 0 ? (
              <p className="muted">{s.progress.nobodyYet}</p>
            ) : (
              progress.by_competency.map((c) => (
                <CompetencyRow key={c.competency} row={c} nf={nf} s={s} locale={locale} />
              ))
            )}
          </section>

          {scope === 'platform' && progress.by_org.length > 0 && (
            <section className="panel">
              <h3>{s.progress.bySchool}</h3>
              <table className="sessions-table">
                <thead>
                  <tr>
                    <th>{s.activity.school}</th>
                    <th className="num">{s.progress.measurable}</th>
                    <th className="num">{s.progress.first}</th>
                    <th className="num">{s.progress.latest}</th>
                    <th className="num">{s.progress.change}</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.by_org.map((o) => {
                    const name =
                      activity.by_school?.find((x) => x.id === o.org_id)?.name ?? o.org_id;
                    return o.suppressed ? (
                      <tr key={o.org_id} className="muted-row">
                        <td>{name}</td>
                        <td className="num">{nf(o.students)}</td>
                        <td colSpan={3} className="suppressed">{s.progress.withheldRow}</td>
                      </tr>
                    ) : (
                      <tr key={o.org_id}>
                        <td>{name}</td>
                        <td className="num">{nf(o.students)}</td>
                        <td className="num">{nf(o.first_score, 2)}</td>
                        <td className="num">{nf(o.latest_score, 2)}</td>
                        <td className="num">
                          <Delta value={o.latest_score - o.first_score} locale={locale} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="field-hint">{s.progress.suppressionNote}</p>
            </section>
          )}

          {progress.practice.length > 0 && (
            <section className="panel">
              <h3>{s.progress.practice}</h3>
              <p className="panel-hint">{s.progress.practiceHint}</p>
              <table className="sessions-table">
                <thead>
                  <tr>
                    <th>{s.progress.interviewsCompleted}</th>
                    <th className="num">{s.progress.students}</th>
                    <th className="num">{s.progress.meanChange}</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.practice.map((b) => (
                    <tr key={b.band} className={b.suppressed ? 'muted-row' : undefined}>
                      <td>{b.band}</td>
                      <td className="num">{nf(b.students)}</td>
                      <td className="num">
                        {b.suppressed ? (
                          <span className="suppressed">{s.progress.withheldShort}</span>
                        ) : (
                          <Delta value={b.mean_change} locale={locale} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      <p className="field-hint stats-footnote">{s.cannotShow}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Card({ label, value, children }) {
  return (
    <div className="stat-card">
      <span className="stat-card-label">{label}</span>
      <strong className="stat-card-value">{value}</strong>
      {children ? <span className="stat-card-sub">{children}</span> : null}
    </div>
  );
}

/**
 * A change, coloured by its sign.
 *
 * Not always green. Real data has competencies going down — on production,
 * time management and ethics both fell while resilience rose — and a page that
 * paints every delta as success is lying about the two that matter most.
 */
function Delta({ value, locale }) {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  const rounded = Number(value.toFixed(2));
  const cls = rounded > 0 ? 'delta up' : rounded < 0 ? 'delta down' : 'delta flat';
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±';
  return (
    <span className={cls}>
      {sign}
      {new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        Math.abs(rounded)
      )}
    </span>
  );
}

function CompetencyRow({ row, nf, s, locale }) {
  if (row.suppressed) {
    return (
      <div className="competency-row suppressed-row">
        <span className="competency-name">{humanise(row.competency)}</span>
        <span className="suppressed">{s.progress.withheldRow}</span>
      </div>
    );
  }
  return (
    <div className="competency-row">
      <span className="competency-name">{humanise(row.competency)}</span>
      <span className="competency-bars">
        <span className="competency-track">
          <span className="competency-before" style={{ width: `${(row.first_score / 5) * 100}%` }} />
        </span>
        <span className="competency-track">
          <span
            className={`competency-after ${row.latest_score < row.first_score ? 'down' : ''}`}
            style={{ width: `${(row.latest_score / 5) * 100}%` }}
          />
        </span>
      </span>
      <span className="competency-figures">
        {nf(row.first_score, 2)} → {nf(row.latest_score, 2)}{' '}
        <Delta value={row.latest_score - row.first_score} locale={locale} />
      </span>
    </div>
  );
}

function Bar({ label, share, value }) {
  return (
    <div className="stat-bar">
      <span className="stat-bar-label">{label}</span>
      <span className="stat-bar-track">
        <span className="stat-bar-fill" style={{ width: `${extent(share)}%` }} />
      </span>
      <span className="stat-bar-value">{value}</span>
    </div>
  );
}

/**
 * A proportion as a percentage width, with a floor so that a small but real
 * value is still visible — and *no* floor at zero.
 *
 * The floor was applied unconditionally at first, so "0%" drew a sliver of
 * blue. A bar that shows something when the answer is nothing is worse than no
 * bar: the number said 0 and the picture disagreed with it.
 */
function extent(share) {
  if (!share || share <= 0) return 0;
  return Math.max(share * 100, 1.5);
}

/**
 * Completed interviews over time.
 *
 * Every bar carries its number. The first draft relied on a `title` tooltip,
 * which is invisible on a touch screen and unreadable at a glance on any
 * screen — the first question anyone asked was "how many is that one".
 *
 * All bars are the same colour. The draft painted the last one solid, carried
 * over from a mockup where it was decoration; on a real chart a different
 * colour reads as a different kind of thing, and it meant nothing at all.
 */
function Trend({ buckets, granularity, locale, nf }) {
  const max = Math.max(...buckets.map((b) => b.completed), 1);
  const fmt = {
    day: { day: 'numeric', month: 'short' },
    week: { day: 'numeric', month: 'short' },
    month: { month: 'short', year: '2-digit' },
  }[granularity];

  return (
    <div className="stat-trend">
      {buckets.map((b) => (
        <div className="stat-trend-col" key={b.bucket}>
          <span className="stat-trend-value">{nf(b.completed)}</span>
          <span className="stat-trend-plot">
            <span
              className={`stat-trend-bar${b.completed === 0 ? ' empty' : ''}`}
              style={{ height: `${extent(b.completed / max)}%` }}
            />
          </span>
          <span className="stat-trend-label">
            {new Date(b.bucket).toLocaleDateString(locale, fmt)}
          </span>
        </div>
      ))}
    </div>
  );
}

function UtilRow({ label, now, was, change, fmt, locale }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{fmt(now)}</td>
      <td className="num">{was === null || was === undefined ? '—' : fmt(was)}</td>
      <td className="num">
        {change === null || change === undefined ? (
          <span className="muted">—</span>
        ) : (
          <span className={change > 0 ? 'delta up' : change < 0 ? 'delta down' : 'delta flat'}>
            {signedPercent(change, locale)}
          </span>
        )}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ helpers */

function signedPercent(fraction, locale) {
  const v = new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(Math.abs(fraction));
  return `${fraction > 0 ? '+' : fraction < 0 ? '−' : ''}${v}`;
}

/**
 * A competency key as a reader sees it.
 *
 * These come from the school's own rubric — `technical_knowledge`,
 * `time_management` — and are deliberately NOT translated: they are the
 * school's words, written in the school's language, and a platform that
 * replaced them with its own would be renaming somebody else's assessment.
 */
function humanise(key) {
  const spaced = key.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function duration(seconds, s) {
  const v = Math.round(seconds ?? 0);
  if (v < 60) return s.utilisation.seconds(v);
  if (v < 3600) return s.utilisation.minutes(Math.round(v / 60));
  return s.utilisation.hoursMinutes(Math.floor(v / 3600), Math.round((v % 3600) / 60));
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 3);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
