import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import { dateLocale, localized, normalizeLanguage, useT } from '../i18n/index.js';
import logo from '../assets/images/Logo_Rise.svg';
import UserMenu from '../components/UserMenu.jsx';
import ProgressChart from '../components/ProgressChart.jsx';
import ScoreBar, { formatScore } from '../components/ScoreBar.jsx';

const COMPETENCY_ORDER = [
  'technical_knowledge',
  'resilience',
  'ethics',
  'time_management',
  'authenticity',
];

function formatDate(ts, locale) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** Position on the 1–5 scale, as a percentage, for the dumbbell rows. */
const pct = (v) => ((Math.max(1, Math.min(5, v)) - 1) / 4) * 100;

export default function TeacherStudent() {
  const { id } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const lang = normalizeLanguage(user?.preferred_language) || 'en';
  const locale = dateLocale(lang);

  const [data, setData] = useState(null);
  const [scenarios, setScenarios] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    Promise.all([api.studentProgress(id), api.scenarios()])
      .then(([progress, sc]) => {
        setData(progress);
        setScenarios(sc.scenarios);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  const scenarioById = useMemo(() => {
    const map = {};
    (scenarios ?? []).forEach((s) => (map[s.scenario_id] = s));
    return map;
  }, [scenarios]);

  const titleOf = (session) => {
    const sc = scenarioById[session.scenario_id];
    const lang = normalizeLanguage(session.language ?? user.preferred_language);
    return sc ? localized(sc, 'title', lang) : session.scenario_id;
  };

  /** One chart per scenario — see the note in ProgressChart for why. */
  const byScenario = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    data.sessions
      .filter((s) => s.avg_score != null)
      .forEach((s) => {
        if (!map.has(s.scenario_id)) map.set(s.scenario_id, []);
        map.get(s.scenario_id).push(s);
      });
    return [...map.entries()].map(([scenarioId, list]) => {
      list.sort((a, b) => a.attempt_number - b.attempt_number);
      return {
        scenarioId,
        title: titleOf(list[0]),
        difficulty: scenarioById[scenarioId]?.difficulty ?? '',
        points: list.map((s) => ({ attempt: s.attempt_number, score: Number(s.avg_score) })),
        first: Number(list[0].avg_score),
        last: Number(list[list.length - 1].avg_score),
      };
    });
  }, [data, scenarioById]);

  /** First vs latest per criterion, across scenarios with two or more attempts. */
  const competencyShift = useMemo(() => {
    if (!data) return [];
    const scored = data.sessions
      .filter((s) => data.competencies[s.id])
      .sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
    if (scored.length < 2) return [];
    const firstSession = data.competencies[scored[0].id] ?? {};
    const lastSession = data.competencies[scored[scored.length - 1].id] ?? {};
    return COMPETENCY_ORDER
      .filter((key) => firstSession[key] != null || lastSession[key] != null)
      .map((key) => ({
        key,
        first: firstSession[key] ?? null,
        last: lastSession[key] ?? null,
      }))
      .filter((row) => row.first != null && row.last != null);
  }, [data]);

  const avg = useMemo(() => {
    if (!data) return null;
    const scored = data.sessions.filter((s) => s.avg_score != null);
    if (!scored.length) return null;
    return scored.reduce((a, s) => a + Number(s.avg_score), 0) / scored.length;
  }, [data]);

  const statusLabels = {
    in_progress: t.common.status.inProgress,
    completed: t.common.status.completed,
    abandoned: t.common.status.abandoned,
  };

  return (
    <main>
      <header className="page-header">
        <div className="brand-heading compact">
          <img src={logo} alt="RISE" />
          <button className="button ghost" onClick={() => navigate('/teacher')}>
            {t.common.backArrow} {t.teacher.title}
          </button>
        </div>
        <UserMenu user={user} logout={logout} label={t.common.signOut} accountLabel={t.account.menuLink} />
      </header>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p>{t.common.loading}</p>}

      {data && (
        <>
          <div className="student-head">
            <h1>{data.student.display_name}</h1>
            <div className="student-tags">
              <span className="tag">{t.student2.scenarioCount(byScenario.length)}</span>
              <span className="tag muted">{t.student2.sessionCount(data.sessions.length)}</span>
              {avg != null && (
                <span className="tag muted">
                  {t.student2.average} {formatScore(avg, locale)}
                </span>
              )}
            </div>
          </div>

          <div className="note warn">
            <span className="note-label">{t.student2.cautionLabel}</span>
            <p>{t.student2.caution}</p>
          </div>

          <section className="panel">
            <h2>{t.student2.progressTitle}</h2>
            <p className="panel-hint">{t.student2.progressHint}</p>
            {byScenario.length === 0 ? (
              <p className="empty-state">{t.student2.noScored}</p>
            ) : (
              <div className="small-multiples">
                {byScenario.map((s) => {
                  const delta = s.last - s.first;
                  const kind = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
                  return (
                    <div className="small-multiple" key={s.scenarioId}>
                      <div className="sm-head">
                        <strong>{s.title}</strong>
                        {s.difficulty && <span className="sm-level">{s.difficulty}</span>}
                      </div>
                      <p className="sm-caption">{t.student2.attemptCount(s.points.length)}</p>
                      <ProgressChart points={s.points} locale={locale} />
                      <div className="sm-foot">
                        <span>
                          {t.student2.first} <b>{formatScore(s.first, locale)}</b> →{' '}
                          {t.student2.last} <b>{formatScore(s.last, locale)}</b>
                        </span>
                        {s.points.length > 1 && (
                          <span className={`score-delta ${kind}`}>
                            {delta > 0 ? '+' : ''}{formatScore(delta, locale)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {competencyShift.length > 0 && (
            <section className="panel">
              <h2>{t.student2.competencyTitle}</h2>
              <p className="panel-hint">{t.student2.competencyHint}</p>
              <table className="competency-table">
                <thead>
                  <tr>
                    <th>{t.student2.competency}</th>
                    <th className="col-shift">{t.student2.change}</th>
                    <th className="col-num">{t.student2.first}</th>
                    <th className="col-num">{t.student2.last}</th>
                    <th className="col-num">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {competencyShift.map((row) => {
                    const delta = row.last - row.first;
                    const kind = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
                    const lo = Math.min(pct(row.first), pct(row.last));
                    const hi = Math.max(pct(row.first), pct(row.last));
                    return (
                      <tr key={row.key}>
                        <td>
                          <span className="competency-name">{t.competency[row.key] ?? row.key}</span>
                        </td>
                        <td>
                          <span className="dumbbell">
                            <span className="dumbbell-track" />
                            <span className="dumbbell-link"
                                  style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
                            <span className="dumbbell-dot from" style={{ left: `${pct(row.first)}%` }}
                                  title={t.student2.first} />
                            <span className="dumbbell-dot to" style={{ left: `${pct(row.last)}%` }}
                                  title={t.student2.last} />
                          </span>
                        </td>
                        <td className="col-num">{formatScore(row.first, locale)}</td>
                        <td className="col-num">{formatScore(row.last, locale)}</td>
                        <td className="col-num">
                          <span className={`score-delta ${kind}`}>
                            {delta > 0 ? '+' : ''}{formatScore(delta, locale)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          <section className="panel">
            <h2>{t.student2.historyTitle}</h2>
            <p className="panel-hint">{t.student2.historyHint}</p>
            {data.sessions.map((s) => {
              const isLatest = data.latest?.session_id === s.id;
              const score = s.avg_score == null ? null : Number(s.avg_score);
              return (
                <details className="attempt" key={s.id} open={isLatest}>
                  <summary>
                    <span className="attempt-title">{titleOf(s)}</span>
                    <span className="attempt-when">
                      {t.student2.attemptNumber(s.attempt_number)} · {formatDate(s.started_at, locale)}
                    </span>
                    <span className="attempt-right">
                      <span className={`status-pill status-${s.status}`}>
                        {statusLabels[s.status] ?? s.status}
                      </span>
                      <ScoreBar score={score} locale={locale} />
                    </span>
                  </summary>
                  <div className="attempt-body">
                    {isLatest && data.latest.questions.length > 0 ? (
                      <>
                        {data.latest.questions.map((q) => (
                          <div className="question-row" key={q.question_id}>
                            <span className="question-number">{q.order}</span>
                            <span className="question-body">
                              <p className="question-text">{localized(q, 'question', normalizeLanguage(s.language))}</p>
                              <span className="question-id">{q.question_id}</span>
                            </span>
                            <span className="question-score">
                              <ScoreBar score={q.score} locale={locale} />
                            </span>
                          </div>
                        ))}
                        {data.latest.summary && (
                          <div className="ai-feedback">
                            {data.latest.summary.strengths && (
                              <>
                                <span className="note-label">{t.student2.strengths}</span>
                                <p>{data.latest.summary.strengths}</p>
                              </>
                            )}
                            {data.latest.summary.improvements && (
                              <>
                                <span className="note-label">{t.student2.improvements}</span>
                                <p>{data.latest.summary.improvements}</p>
                              </>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="empty-state">
                        {s.answered_count > 0 ? t.student2.openToRead : t.student2.notFinished}
                      </p>
                    )}
                    {s.answered_count > 0 && (
                      <p className="attempt-actions">
                        <button
                          className="button ghost"
                          onClick={() =>
                            navigate(`/teacher/sessions/${s.id}`, {
                              state: { from: { path: `/teacher/students/${id}`, label: data.student.display_name } },
                            })
                          }
                        >
                          {t.teacher.review}
                        </button>
                      </p>
                    )}
                  </div>
                </details>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
