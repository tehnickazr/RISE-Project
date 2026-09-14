import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import { dateLocale, localized, normalizeLanguage, useT } from '../i18n/index.js';
import logo from '../assets/images/Logo_Rise.svg';
import UserMenu from '../components/UserMenu.jsx';
import Combobox from '../components/Combobox.jsx';
import TeacherTabs from '../components/TeacherTabs.jsx';
import InviteStudent from '../components/InviteStudent.jsx';
import ScoreBar, { formatScore } from '../components/ScoreBar.jsx';

const STATUS_LABELS = (t) => ({
  in_progress: t.common.status.inProgress,
  completed: t.common.status.completed,
  abandoned: t.common.status.abandoned,
});

const QUICK_FILTERS = ['all', 'attention', 'first', 'repeat'];

function formatDate(ts, locale) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

function daysAgo(ts) {
  if (!ts) return Infinity;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
}

/** A session "needs attention" if it was never finished, or scored poorly. */
function needsAttention(session) {
  if (session.status !== 'completed') return true;
  return session.avg_score != null && Number(session.avg_score) < 2.5;
}

export default function TeacherDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const lang = normalizeLanguage(user?.preferred_language) || 'en';
  const locale = dateLocale(lang);

  const [sessions, setSessions] = useState(null);
  const [scenarios, setScenarios] = useState(null);
  const [error, setError] = useState(null);

  const [filterStudent, setFilterStudent] = useState('');
  const [filterScenario, setFilterScenario] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [quick, setQuick] = useState('all');
  const [sort, setSort] = useState({ key: 'date', dir: -1 });

  useEffect(() => {
    Promise.all([api.sessions(), api.scenarios()])
      .then(([s, sc]) => {
        setSessions(s.sessions);
        setScenarios(sc.scenarios);
      })
      .catch((err) => setError(err.message));
  }, []);

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

  const studentOptions = useMemo(() => {
    const map = new Map();
    (sessions ?? []).forEach((s) => map.set(s.student_id, s.student_name));
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [sessions]);

  const scenarioOptions = useMemo(() => {
    const map = new Map();
    (sessions ?? []).forEach((s) => map.set(s.scenario_id, titleOf(s)));
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [sessions, scenarioById]);

  /** Previous attempt at the same scenario, so a row can show movement. */
  const previousScore = useMemo(() => {
    const index = new Map();
    (sessions ?? []).forEach((s) => {
      const key = `${s.student_id}:${s.scenario_id}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(s);
    });
    const out = new Map();
    for (const list of index.values()) {
      list.sort((a, b) => a.attempt_number - b.attempt_number);
      let last = null;
      for (const s of list) {
        if (last != null) out.set(s.id, last);
        if (s.avg_score != null) last = Number(s.avg_score);
      }
    }
    return out;
  }, [sessions]);

  const filtered = useMemo(() => {
    if (!sessions) return [];
    const rows = sessions.filter((s) => {
      if (filterStudent && s.student_id !== filterStudent) return false;
      if (filterScenario && s.scenario_id !== filterScenario) return false;
      if (filterStatus && s.status !== filterStatus) return false;
      if (filterPeriod && daysAgo(s.started_at) > Number(filterPeriod)) return false;
      if (quick === 'attention' && !needsAttention(s)) return false;
      if (quick === 'first' && s.attempt_number !== 1) return false;
      if (quick === 'repeat' && s.attempt_number < 2) return false;
      return true;
    });
    const { key, dir } = sort;
    return rows.sort((a, b) => {
      let x;
      let y;
      switch (key) {
        case 'student': x = a.student_name ?? ''; y = b.student_name ?? ''; break;
        case 'scenario': x = titleOf(a); y = titleOf(b); break;
        case 'attempt': x = a.attempt_number; y = b.attempt_number; break;
        case 'status': x = a.status; y = b.status; break;
        case 'score': x = a.avg_score == null ? -1 : Number(a.avg_score);
          y = b.avg_score == null ? -1 : Number(b.avg_score); break;
        default: x = a.started_at; y = b.started_at;
      }
      if (x < y) return -dir;
      if (x > y) return dir;
      return 0;
    });
  }, [sessions, filterStudent, filterScenario, filterStatus, filterPeriod, quick, sort, scenarioById]);

  const stats = useMemo(() => {
    if (!sessions) return null;
    const scored = sessions.filter((s) => s.avg_score != null);
    const avg = scored.length
      ? scored.reduce((a, s) => a + Number(s.avg_score), 0) / scored.length
      : null;
    return {
      students: new Set(sessions.map((s) => s.student_id)).size,
      week: sessions.filter((s) => daysAgo(s.started_at) <= 7).length,
      total: sessions.length,
      avg,
      attention: new Set(sessions.filter(needsAttention).map((s) => s.student_id)).size,
    };
  }, [sessions]);

  const statusLabels = STATUS_LABELS(t);

  function toggleSort(key) {
    setSort((cur) =>
      cur.key === key
        ? { key, dir: -cur.dir }
        : { key, dir: key === 'date' || key === 'score' ? -1 : 1 }
    );
  }

  function sortMark(key) {
    if (sort.key !== key) return '↕';
    return sort.dir === 1 ? '↑' : '↓';
  }

  return (
    <main>
      <header className="page-header">
        <img className="brand-logo" src={logo} alt="RISE" />
        <UserMenu user={user} logout={logout} label={t.common.signOut} accountLabel={t.account.menuLink} />
      </header>

      <TeacherTabs />

      <div className="page-heading">
        <div>
          <h1>{t.teacher.title}</h1>
          <p className="page-intro">{t.teacher.intro}</p>
        </div>
        {/* No reload afterwards: this page lists interviews, and somebody who
            was invited a second ago has none. They appear here of their own
            accord once they sit their first one. */}
        <InviteStudent />
      </div>

      {error && <p className="error">{error}</p>}
      {!sessions && !error && <p>{t.common.loading}</p>}

      {sessions && (
        <>
          {stats && (
            <div className="kpis">
              <div className="kpi">
                <div className="kpi-label">{t.teacher.kpiStudents}</div>
                <div className="kpi-value">{stats.students}</div>
                <div className="kpi-note">{t.teacher.kpiStudentsNote}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">{t.teacher.kpiWeek}</div>
                <div className="kpi-value">{stats.week}</div>
                <div className="kpi-note">{t.teacher.kpiTotal(stats.total)}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">{t.teacher.kpiAvg}</div>
                <div className="kpi-value">{formatScore(stats.avg, locale)}</div>
                <div className="kpi-note">{t.teacher.kpiAvgNote}</div>
              </div>
              <div className={`kpi${stats.attention ? ' is-alert' : ''}`}>
                <div className="kpi-label">{t.teacher.kpiAttention}</div>
                <div className="kpi-value">{stats.attention}</div>
                <div className="kpi-note">{t.teacher.kpiAttentionNote}</div>
              </div>
            </div>
          )}

          <div className="panel">
            <div className="filters">
              <Combobox
                label={t.teacher.filterStudent}
                value={filterStudent}
                onChange={setFilterStudent}
                options={studentOptions}
                allLabel={t.teacher.filterAll}
                placeholder={t.teacher.filterSearch}
                noResults={t.teacher.filterNoMatch}
                clearLabel={t.teacher.filterClear}
                minWidth={240}
              />
              <Combobox
                label={t.teacher.filterScenario}
                value={filterScenario}
                onChange={setFilterScenario}
                options={scenarioOptions}
                allLabel={t.teacher.filterAllScenarios}
                placeholder={t.teacher.filterSearch}
                noResults={t.teacher.filterNoMatch}
                clearLabel={t.teacher.filterClear}
                minWidth={260}
              />
              <label>
                {t.teacher.filterStatus}
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="">{t.teacher.filterAllStatus}</option>
                  <option value="completed">{t.common.status.completed}</option>
                  <option value="in_progress">{t.common.status.inProgress}</option>
                  <option value="abandoned">{t.common.status.abandoned}</option>
                </select>
              </label>
              <label>
                {t.teacher.filterPeriod}
                <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)}>
                  <option value="">{t.teacher.periodAll}</option>
                  <option value="7">{t.teacher.period7}</option>
                  <option value="30">{t.teacher.period30}</option>
                </select>
              </label>
            </div>

            <div className="chips" role="group" aria-label={t.teacher.quickFilters}>
              {QUICK_FILTERS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={quick === key ? 'is-on' : ''}
                  aria-pressed={quick === key}
                  onClick={() => setQuick(key)}
                >
                  {t.teacher.quick[key]}
                </button>
              ))}
            </div>

            <p className="result-count">{t.teacher.resultCount(filtered.length, sessions.length)}</p>

            {filtered.length === 0 ? (
              <p className="empty-state">{t.teacher.none}</p>
            ) : (
              <table className="sessions-table">
                <thead>
                  <tr>
                    {[
                      ['student', t.teacher.student],
                      ['scenario', t.teacher.scenario],
                      ['attempt', t.teacher.attempt],
                      ['status', t.teacher.status],
                      ['score', t.teacher.avgScore],
                      ['date', t.teacher.started],
                    ].map(([key, label]) => (
                      <th
                        key={key}
                        data-sort={key}
                        className={sort.key === key ? 'is-sorted' : ''}
                        aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                      >
                        <button type="button" className="th-sort" onClick={() => toggleSort(key)}>
                          {label} <span className="sortmark">{sortMark(key)}</span>
                        </button>
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const prev = previousScore.get(s.id);
                    const score = s.avg_score == null ? null : Number(s.avg_score);
                    return (
                      <tr key={s.id}>
                        <td data-label={t.teacher.student}>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => navigate(`/teacher/students/${s.student_id}`)}
                          >
                            {s.student_name}
                          </button>
                        </td>
                        <td data-label={t.teacher.scenario}>{titleOf(s)}</td>
                        <td data-label={t.teacher.attempt}>{s.attempt_number}</td>
                        <td data-label={t.teacher.status}>
                          <span className={`status-pill status-${s.status}`}>
                            {statusLabels[s.status] ?? s.status}
                          </span>
                        </td>
                        <td data-label={t.teacher.avgScore}>
                          <ScoreBar
                            score={score}
                            delta={score != null && prev != null ? score - prev : null}
                            locale={locale}
                            deltaTitle={t.teacher.deltaTitle}
                          />
                        </td>
                        <td data-label={t.teacher.started}>{formatDate(s.started_at, locale)}</td>
                        <td className="table-action">
                          <button
                            className="button ghost"
                            onClick={() =>
                              navigate(`/teacher/sessions/${s.id}`, {
                                state: { from: { path: '/teacher', label: t.teacher.title } },
                              })
                            }
                          >
                            {t.teacher.review}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </main>
  );
}
