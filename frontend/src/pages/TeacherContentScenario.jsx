import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import { localized, normalizeLanguage, useT } from '../i18n/index.js';
import logo from '../assets/images/Logo_Rise.svg';
import UserMenu from '../components/UserMenu.jsx';

const TYPE_ORDER = ['general', 'technical', 'situational', 'behavioral', 'trap'];

/** Distinct hues for the weight bar. Segments are ordered by weight, not by name. */
const COMPETENCY_COLORS = {
  technical_knowledge: '#0040a1',
  resilience: '#d97706',
  ethics: '#067047',
  time_management: '#7c3aed',
  authenticity: '#be185d',
};
export default function TeacherContentScenario() {
  const { id } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const lang = normalizeLanguage(user?.preferred_language) || 'en';

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    setData(null);
    setError(null);
    setTypeFilter('');
    api.scenario(id)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id]);

  const scenario = data?.scenario;
  const questions = scenario?.questions ?? [];

  const byType = useMemo(() => {
    const counts = {};
    questions.forEach((q) => { counts[q.type] = (counts[q.type] ?? 0) + 1; });
    return counts;
  }, [questions]);

  const rubrics = useMemo(() => {
    const list = [...(scenario?.rubrics ?? [])];
    list.sort((a, b) => Number(b.weight) - Number(a.weight));
    return list;
  }, [scenario]);

  const visible = typeFilter ? questions.filter((q) => q.type === typeFilter) : questions;
  const perSession = data?.serving?.per_session;
  const quota = data?.serving?.quota ?? {};

  /** How many questions have no expected answer — the field the model scores against. */
  const missingAnchors = questions.filter((q) => !(q.expected_answer ?? '').trim()).length;

  return (
    <main>
      <header className="page-header">
        <div className="brand-heading compact">
          <img src={logo} alt="RISE" />
          <button className="button ghost" onClick={() => navigate('/teacher/content')}>
            {t.common.backArrow} {t.content.title}
          </button>
        </div>
        <UserMenu user={user} logout={logout} label={t.common.signOut} accountLabel={t.account.menuLink} />
      </header>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p>{t.common.loading}</p>}

      {scenario && (
        <>
          <h1>{localized(scenario, 'title', lang) || scenario.scenario_id}</h1>
          <p className="page-intro">{localized(scenario, 'description', lang)}</p>

          {scenario.active === false && (
            <div className="note">
              <span className="note-label">{t.content.retired}</span>
              <p>{t.content.retiredExplain}</p>
            </div>
          )}

          <div className="student-tags content-meta">
            {scenario.active === false && (
              <span className="retired-pill">{t.content.retired}</span>
            )}
            {scenario.difficulty && <span className="tag">{scenario.difficulty}</span>}
            {scenario.sector && <span className="tag muted">{scenario.sector}</span>}
            <span className="tag muted">{t.content.bankSize(questions.length)}</span>
            {perSession != null && (
              <span className="tag muted">{t.content.perSession(perSession)}</span>
            )}
            <code className="tag muted">{scenario.scenario_id}</code>
          </div>

          {missingAnchors > 0 && (
            <div className="note warn">
              <span className="note-label">{t.content.anchorWarnLabel}</span>
              <p>{t.content.anchorWarn(missingAnchors)}</p>
            </div>
          )}

          <section className="panel">
            <h2>{t.content.rubricTitle}</h2>
            <p className="panel-hint">{t.content.rubricHint}</p>
            {rubrics.length === 0 ? (
              <p className="empty-state">{t.content.noRubric}</p>
            ) : (
              <>
                <div className="weight-bar" role="img"
                     aria-label={rubrics.map((r) => `${t.competency[r.competency] ?? r.competency} ${Math.round(Number(r.weight) * 100)}%`).join(', ')}>
                  {rubrics.map((r) => (
                    <span
                      key={r.rubric_id}
                      style={{
                        width: `${Number(r.weight) * 100}%`,
                        background: COMPETENCY_COLORS[r.competency] ?? '#737785',
                      }}
                    />
                  ))}
                </div>
                <ul className="rubric-list">
                  {rubrics.map((r) => (
                    <li key={r.rubric_id}>
                      <span className="rubric-swatch"
                            style={{ background: COMPETENCY_COLORS[r.competency] ?? '#737785' }} />
                      <span className="rubric-body">
                        <span className="rubric-head">
                          <strong>{t.competency[r.competency] ?? localized(r, 'label', lang)}</strong>
                          <code>{r.competency}</code>
                          <b className="rubric-weight">{Math.round(Number(r.weight) * 100)}%</b>
                        </span>
                        <span className="rubric-desc">{localized(r, 'description', lang)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="panel">
            <h2>{t.content.mixTitle}</h2>
            <p className="panel-hint">{t.content.mixHint}</p>
            <div className="type-stats">
              {TYPE_ORDER.filter((type) => byType[type]).map((type) => (
                <span className="type-stat" key={type}>
                  <b>{byType[type]}</b> {t.questionType[type]}
                  {quota[type] != null && <em> · {t.content.quotaNote(quota[type])}</em>}
                </span>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>{t.content.questionsTitle}</h2>
            <p className="panel-hint">{t.content.questionsHint}</p>

            <div className="chips" role="group" aria-label={t.content.filterByType}>
              <button type="button" className={typeFilter === '' ? 'is-on' : ''}
                      aria-pressed={typeFilter === ''} onClick={() => setTypeFilter('')}>
                {t.content.allTypes(questions.length)}
              </button>
              {TYPE_ORDER.filter((type) => byType[type]).map((type) => (
                <button key={type} type="button" className={typeFilter === type ? 'is-on' : ''}
                        aria-pressed={typeFilter === type} onClick={() => setTypeFilter(type)}>
                  {t.questionType[type]} ({byType[type]})
                </button>
              ))}
            </div>

            {visible.map((q) => {
              const anchor = (q.expected_answer ?? '').trim();
              return (
                <article className="content-question" key={q.question_id}>
                  <div className="cq-head">
                    <span className="question-number">{q.order}</span>
                    <span className={`type-chip type-${q.type}`}>{t.questionType[q.type] ?? q.type}</span>
                    <code className="cq-competency">{q.competency}</code>
                    <code className="cq-id">{q.question_id}</code>
                  </div>
                  <p className="cq-text">{localized(q, 'question', lang)}</p>
                  <div className={`anchor${anchor ? '' : ' is-missing'}`}>
                    <span className="note-label">
                      {anchor ? t.content.expectedAnswer : t.content.expectedMissing}
                    </span>
                    {anchor && (
                      <>
                        <p>{anchor}</p>
                        <span className="anchor-meta">{t.content.charCount(anchor.length)}</span>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
