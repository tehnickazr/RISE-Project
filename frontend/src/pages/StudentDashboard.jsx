import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import { professionLabel } from '../i18n/professions.js';
import {
  dateLocale,
  localized,
  normalizeLanguage,
  qualificationLabel,
  sectorKey,
  sectorLabel,
  useT,
} from '../i18n/index.js';
import logo from '../assets/images/Logo_Rise.svg';
import UserMenu from '../components/UserMenu.jsx';

/** Accent- and case-insensitive, so "macon" finds "Maçon" and "zavarivac" finds
 *  "Bravar-zavarivač" — the way a student types on a phone keyboard. */
const fold = (s) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Whole days between then and now, floored — used only for wording. */
function daysSince(ts) {
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
}

/** "yesterday", "5 days ago", "3 weeks ago" — localized, no strings of our own. */
function relativeDays(days, locale) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (days < 7) return rtf.format(-days, 'day');
  if (days < 60) return rtf.format(-Math.round(days / 7), 'week');
  return rtf.format(-Math.round(days / 30), 'month');
}

export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const lang = normalizeLanguage(user.preferred_language);
  const locale = dateLocale(lang);
  const t = useT();

  const [scenarios, setScenarios] = useState(null);
  const [sessions, setSessions] = useState([]);
  // What is left to start. Computed by the server, not from `sessions` above:
  // that list is filtered to this student's own language and the limits
  // deliberately are not, so counting these rows would give the wrong number to
  // anyone who has ever switched language.
  const [allowance, setAllowance] = useState(null);
  const [sessionLength, setSessionLength] = useState(10);
  const [error, setError] = useState(null);
  const [startingId, setStartingId] = useState(null);

  const [query, setQuery] = useState('');
  const [sector, setSector] = useState('');
  const [level, setLevel] = useState('');
  const [openRows, setOpenRows] = useState(() => new Set());
  const [showAllResume, setShowAllResume] = useState(false);

  useEffect(() => {
    Promise.all([api.scenarios(), api.sessions()])
      .then(([s, ss]) => {
        setScenarios(s.scenarios);
        setSessions(ss.sessions);
        setAllowance(ss.allowance ?? null);
        if (ss.session_length) setSessionLength(ss.session_length);
      })
      .catch((err) => setError(err.message));
  }, []);

  /**
   * What this student may still start.
   *
   * Zero means "no limit" in the store, so every question here is asked as
   * "is there a limit, and is it used up" rather than by comparing to zero —
   * treating an absent limit as a limit of nothing would lock out every student
   * at a school that turned the caps off.
   *
   * None of this can stop anyone finishing an interview they already opened.
   * The Continue panel below is drawn from `sessions` and never consults this.
   */
  const totalLimit = allowance?.total_interviews ?? 0;
  const perScenarioLimit = allowance?.attempts_per_scenario ?? 0;
  const totalExhausted = totalLimit > 0 && (allowance?.remaining_total ?? 1) <= 0;

  /** Attempts left at one scenario, or null where attempts are not capped. */
  const attemptsLeftFor = (scenarioId) => {
    if (perScenarioLimit <= 0) return null;
    return Math.max(0, perScenarioLimit - (allowance?.used_per_scenario?.[scenarioId] ?? 0));
  };

  /**
   * When this scenario comes back, or null if it is available now.
   *
   * The server sends a date only for scenarios actually waiting, and only for
   * that scenario — each interview carries its own clock, so one being in
   * cooldown says nothing about any other.
   */
  const cooldownFor = (scenarioId) => {
    const iso = allowance?.cooldown_until_per_scenario?.[scenarioId];
    if (!iso) return null;
    const until = new Date(iso);
    // The page may have been open since before it expired.
    return until.getTime() > Date.now() ? until : null;
  };

  const untilLabel = (date) =>
    date.toLocaleDateString(locale, { day: 'numeric', month: 'long' });

  /**
   * Why this scenario cannot be started, or null if it can.
   *
   * Written once and in the same order the endpoint uses — total, then
   * attempts, then cooldown — so the page and the server never disagree about
   * which of several reasons a student is shown. Three separate booleans read
   * in three places is how they would come to disagree.
   */
  const startBlock = (scenarioId) => {
    if (totalExhausted) return { code: 'limit_total', message: t.student.limitTotal(totalLimit) };
    const left = attemptsLeftFor(scenarioId);
    if (left === 0) {
      return { code: 'limit_attempts', message: t.student.limitAttempts(perScenarioLimit) };
    }
    const until = cooldownFor(scenarioId);
    if (until) {
      return { code: 'limit_cooldown', message: t.student.limitCooldown(untilLabel(until)) };
    }
    return null;
  };

  const canStart = (scenarioId) => startBlock(scenarioId) === null;

  const startScenario = async (scenario_id) => {
    setStartingId(scenario_id);
    setError(null);
    try {
      const { session } = await api.startSession(scenario_id);
      navigate(`/student/sessions/${session.id}`);
    } catch (e) {
      // The server is the one that decides, and it can say no to a page that
      // was drawn before the last interview was started — or before an
      // administrator lowered the cap. Translated on the code, because the
      // sentence the endpoint carries is English and this student may not read
      // it.
      const until = e.availableAt ? new Date(e.availableAt) : null;
      const translated =
        e.code === 'limit_total'
          ? t.student.limitTotal(totalLimit || allowance?.total_interviews)
          : e.code === 'limit_attempts'
          ? t.student.limitAttempts(perScenarioLimit || allowance?.attempts_per_scenario)
          : e.code === 'limit_cooldown' && until && !Number.isNaN(until.getTime())
          ? t.student.limitCooldown(untilLabel(until))
          : null;
      setError(translated ?? e.message);
      if (translated) {
        // Bring the counters back in step, so the button that just refused is
        // drawn as refused rather than waiting to refuse again.
        api.sessions().then((ss) => setAllowance(ss.allowance ?? null)).catch(() => {});
      }
      setStartingId(null);
    }
  };

  /** This student's own sittings, per scenario, oldest attempt first. */
  const attemptsByScenario = useMemo(() => {
    const map = new Map();
    for (const s of sessions) {
      if (!map.has(s.scenario_id)) map.set(s.scenario_id, []);
      map.get(s.scenario_id).push(s);
    }
    for (const list of map.values()) list.sort((a, b) => a.attempt_number - b.attempt_number);
    return map;
  }, [sessions]);

  const visibleScenarios = useMemo(
    () =>
      (scenarios ?? []).filter((s) =>
        (s.language ?? '').split(',').map((v) => v.trim()).includes(lang)
      ),
    [scenarios, lang]
  );

  /**
   * One entry per occupation, its levels nested.
   *
   * The catalogue holds 213 French scenarios across 75 occupations — each trade
   * exists at three qualification levels, so a row per scenario would be three
   * near-identical rows in a run. A student picks a trade first and a level
   * second, which is also the order they think in.
   */
  /**
   * One entry per row.
   *
   * Normally that is one occupation with its qualification levels beside it: the
   * catalogue holds 213 French scenarios across 75 occupations, each trade
   * existing at three levels, so a row per scenario would be three
   * near-identical rows in a run. A student picks a trade first and a level
   * second, which is the order they think in.
   *
   * The exception is an occupation holding two scenarios at the *same* level,
   * told apart by focus rather than qualification — the Serbian set has two such
   * pairs. Those get a row each, named by their own title. An earlier version
   * kept them in one row and put the titles on the level buttons instead, which
   * forced long text into a column sized to its own content: the buttons came
   * out narrow and four lines tall while the name column sat half empty. Long
   * names belong in the name column.
   */
  const occupations = useMemo(() => {
    const byProfession = new Map();
    for (const s of visibleScenarios) {
      if (!byProfession.has(s.profession)) byProfession.set(s.profession, []);
      byProfession.get(s.profession).push(s);
    }

    const entries = [];
    for (const [profession, list] of byProfession) {
      const levels = list
        .map((s) => ({
          scenario: s,
          qual: qualificationLabel(s.eqf_level, lang) || s.difficulty || '',
        }))
        .sort(
          (a, b) =>
            Number(a.scenario.eqf_level || 0) - Number(b.scenario.eqf_level || 0) ||
            a.scenario.scenario_id.localeCompare(b.scenario.scenario_id)
        );

      const seen = {};
      for (const l of levels) seen[l.qual] = (seen[l.qual] ?? 0) + 1;
      const collides = levels.some((l) => seen[l.qual] > 1);
      const sectorName =
        sectorLabel(list[0].sector?.trim() ? sectorKey(list[0].sector) : '', lang) ||
        t.student.otherSector;

      if (!collides) {
        entries.push({
          key: profession,
          name: professionLabel(profession, lang),
          sectorName,
          levels: levels.map((l) => ({ ...l, label: l.qual })),
        });
      } else {
        for (const l of levels) {
          entries.push({
            key: l.scenario.scenario_id,
            name:
              localized(l.scenario, 'title', lang) ||
              professionLabel(profession, lang),
            sectorName,
            levels: [{ ...l, label: l.qual }],
          });
        }
      }
    }

    return entries.sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [visibleScenarios, lang, locale, t]);

  const sectors = useMemo(
    () =>
      [...new Set(occupations.map((o) => o.sectorName))].sort((a, b) =>
        a.localeCompare(b, locale)
      ),
    [occupations, locale]
  );

  /** The qualification levels this catalogue actually contains, in order. */
  const levelOptions = useMemo(() => {
    const map = new Map();
    for (const o of occupations) {
      for (const l of o.levels) {
        const eqf = String(l.scenario.eqf_level || '');
        if (eqf && !map.has(eqf)) map.set(eqf, l.qual);
      }
    }
    return [...map.entries()].sort(([a], [b]) => Number(a) - Number(b));
  }, [occupations]);

  const filtered = useMemo(() => {
    const needle = fold(query.trim());
    return occupations
      .filter((o) => !sector || o.sectorName === sector)
      .filter((o) => {
        if (!needle) return true;
        if (fold(o.name).includes(needle)) return true;
        // The sector matches only at a word start, and only from three
        // characters. As a substring it produced matches with nothing on screen
        // to explain them — "ma" returning Data Analyst through "Informatique".
        if (needle.length < 3) return false;
        return fold(o.sectorName)
          .split(/[^a-z0-9]+/)
          .some((word) => word.startsWith(needle));
      })
      .map((o) => ({
        ...o,
        levels: o.levels.filter(
          (l) => !level || String(l.scenario.eqf_level || '') === level
        ),
      }))
      .filter((o) => o.levels.length > 0);
  }, [occupations, query, sector, level]);

  const shownScenarios = filtered.reduce((n, o) => n + o.levels.length, 0);

  /** Every unfinished sitting, newest first. */
  const unfinished = useMemo(() => {
    const byId = new Map(visibleScenarios.map((s) => [s.scenario_id, s]));
    return sessions
      .filter((s) => s.status === 'in_progress' && byId.has(s.scenario_id))
      .map((s) => {
        const scenario = byId.get(s.scenario_id);
        const total = scenario.question_count ?? sessionLength;
        return {
          session: s,
          title: localized(scenario, 'title', lang) || scenario.profession,
          answered: s.answered_count ?? 0,
          total,
          days: daysSince(s.started_at),
        };
      })
      .sort((a, b) => new Date(b.session.started_at) - new Date(a.session.started_at));
  }, [sessions, visibleScenarios, lang, sessionLength]);

  function toggleRow(key) {
    setOpenRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const RESUME_SHOWN = 3;
  const resumeVisible = showAllResume ? unfinished : unfinished.slice(0, RESUME_SHOWN);

  return (
    <main>
      <header className="page-header">
        <img className="brand-logo" src={logo} alt="RISE" />
        <UserMenu user={user} logout={logout} label={t.common.signOut} accountLabel={t.account.menuLink} />
      </header>

      {error && <p className="error">{error}</p>}
      {!scenarios && !error && <p>{t.student.loading}</p>}

      {scenarios && occupations.length === 0 && <p>{t.student.noScenarios}</p>}

      {scenarios && occupations.length > 0 && (
        <>
          <h1>{t.student.title}</h1>
          <p className="page-intro">{t.student.intro}</p>

          {/* Said once, above the catalogue, rather than on each of 213 rows.
              The total is the limit that changes what the whole page means;
              per-scenario attempts are shown on the scenario they belong to. */}
          {totalLimit > 0 && (
            <p className={`allowance-line${totalExhausted ? ' is-spent' : ''}`}>
              <strong>
                {totalExhausted
                  ? t.student.limitTotal(totalLimit)
                  : t.student.allowanceLeft(allowance.remaining_total)}
              </strong>
              <span>
                {t.student.allowanceUsed(allowance.used_total, totalLimit)} ·{' '}
                {t.student.allowanceNote}
              </span>
            </p>
          )}

          {unfinished.length > 0 && (
            <div className="resume-panel">
              <div className="resume-head">
                <span className="lbl">
                  {unfinished.length === 1 ? t.student.continueOne : t.student.continueMany}
                </span>
                {unfinished.length > 1 && (
                  <span className="n">{t.student.unfinished(unfinished.length)}</span>
                )}
              </div>
              {resumeVisible.map((item, index) => (
                <div
                  className={`resume-item${item.days >= 14 ? ' stale' : ''}`}
                  key={item.session.id}
                >
                  <span className="who">
                    <strong>{item.title}</strong>
                    <span className="when">
                      {t.student.startedAgo(relativeDays(item.days, locale))} ·{' '}
                      {t.student.questionOf(item.answered + 1, item.total)}
                    </span>
                  </span>
                  <span className="progress-mini">
                    <span className="progress-track">
                      <i style={{ width: `${(item.answered / item.total) * 100}%` }} />
                    </span>
                    {item.answered}/{item.total}
                  </span>
                  <button
                    className={`button ${index === 0 && !showAllResume ? 'primary' : 'ghost'}`}
                    onClick={() => navigate(`/student/sessions/${item.session.id}`)}
                  >
                    {t.student.resume}
                  </button>
                </div>
              ))}
              {unfinished.length > RESUME_SHOWN && (
                <p className="resume-more">
                  <button type="button" onClick={() => setShowAllResume((v) => !v)}>
                    {showAllResume
                      ? t.student.showFewer
                      : t.student.showMore(unfinished.length - RESUME_SHOWN)}
                  </button>
                </p>
              )}
            </div>
          )}

          <div className="panel">
            <div className="filters catalogue-filters">
              <label className="search-wrap">
                {t.student.search}
                <span className="search-icon" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.student.searchPlaceholder}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="search-clear"
                  hidden={query === ''}
                  aria-label={t.student.clearSearch}
                  onClick={() => setQuery('')}
                >
                  ×
                </button>
              </label>
              <label>
                {t.student.sector}
                <select value={sector} onChange={(e) => setSector(e.target.value)}>
                  <option value="">{t.student.allSectors}</option>
                  {sectors.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {levelOptions.length > 1 && (
              <div className="chips" role="group" aria-label={t.student.levelFilter}>
                <button
                  type="button"
                  className={level === '' ? 'is-on' : ''}
                  aria-pressed={level === ''}
                  onClick={() => setLevel('')}
                >
                  {t.student.allLevels}
                </button>
                {levelOptions.map(([eqf, label]) => (
                  <button
                    key={eqf}
                    type="button"
                    className={level === eqf ? 'is-on' : ''}
                    aria-pressed={level === eqf}
                    onClick={() => setLevel(eqf)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <p className="result-count">
              {t.student.resultCount(filtered.length, shownScenarios)}
            </p>

            {filtered.length === 0 ? (
              <div className="empty-state">
                <b>{t.student.noMatch}</b>
                {t.student.noMatchHint}
              </div>
            ) : (
              <table className="catalogue">
                <thead>
                  <tr>
                    <th>{t.student.occupation}</th>
                    <th className="col-sector">{t.student.sector}</th>
                    <th className="col-levels">{t.student.levelFilter}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => {
                    const withHistory = o.levels.filter(
                      (l) => (attemptsByScenario.get(l.scenario.scenario_id) ?? []).length > 0
                    );
                    const totalAttempts = withHistory.reduce(
                      (n, l) => n + attemptsByScenario.get(l.scenario.scenario_id).length,
                      0
                    );
                    const isOpen = openRows.has(o.key);

                    return (
                      <Fragment key={o.key}>
                        <tr className={isOpen ? 'is-open' : undefined}>
                          <td data-label={t.student.occupation}>
                            <span className="occ">{o.name}</span>
                            {totalAttempts > 0 && (
                              <button
                                type="button"
                                className="disclosure"
                                aria-expanded={isOpen}
                                onClick={() => toggleRow(o.key)}
                              >
                                <span className="caret" aria-hidden="true">
                                  ▶
                                </span>{' '}
                                {t.student.attemptCount(totalAttempts)}
                              </button>
                            )}
                          </td>
                          <td className="col-sector" data-label={t.student.sector}>
                            <span className="sector-tag">{o.sectorName}</span>
                          </td>
                          <td className="col-levels" data-label={t.student.levelFilter}>
                            <span className="levels">
                              {o.levels.map((l) => {
                                const own =
                                  attemptsByScenario.get(l.scenario.scenario_id) ?? [];
                                const doing = own.some((s) => s.status === 'in_progress');
                                const state = own.length === 0 ? '' : doing ? 'doing' : 'done';
                                const left = attemptsLeftFor(l.scenario.scenario_id);
                                const block = startBlock(l.scenario.scenario_id);
                                const spent = block !== null;
                                const waiting = cooldownFor(l.scenario.scenario_id);
                                // A level with history still opens its history
                                // when there is nothing left to start — that is
                                // where the student reviews what they already
                                // did, and closing it would take something away
                                // rather than withhold something.
                                const note = spent && !state
                                  ? t.student.noAttemptsLeft
                                  : !state
                                  ? t.student.start
                                  : doing
                                  ? t.common.status.inProgress
                                  : t.common.status.completed;
                                return (
                                  <button
                                    key={l.scenario.scenario_id}
                                    type="button"
                                    className={`level-btn ${state}${spent ? ' spent' : ''}`}
                                    title={
                                      block?.code === 'limit_cooldown' && waiting
                                        ? t.student.cooldownUntil(untilLabel(waiting))
                                        : left !== null && left > 0
                                        ? t.student.attemptsLeft(left)
                                        : undefined
                                    }
                                    disabled={
                                      (startingId !== null && !state) || (spent && !state)
                                    }
                                    onClick={() =>
                                      // A level never taken starts straight away.
                                      // One with history opens that history, where
                                      // starting again is one of several things to
                                      // do — two buttons for "start" was one too
                                      // many.
                                      state
                                        ? toggleRow(o.key)
                                        : startScenario(l.scenario.scenario_id)
                                    }
                                  >
                                    {l.label}
                                    <small>
                                      {startingId === l.scenario.scenario_id
                                        ? t.student.starting
                                        : note}
                                    </small>
                                    {own.length > 1 && (
                                      <span className="count-badge">{own.length}</span>
                                    )}
                                  </button>
                                );
                              })}
                            </span>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr className="attempts-row">
                            <td colSpan={3}>
                              <div className="attempts-inner">
                                {withHistory.map((l) => {
                                  const own = attemptsByScenario.get(l.scenario.scenario_id);
                                  const newestFirst = [...own].reverse();
                                  const next =
                                    Math.max(...own.map((s) => s.attempt_number)) + 1;
                                  const left = attemptsLeftFor(l.scenario.scenario_id);
                                  const block = startBlock(l.scenario.scenario_id);
                                  const spent = block !== null;
                                  const waiting = cooldownFor(l.scenario.scenario_id);
                                  return (
                                    <div className="attempt-group" key={l.scenario.scenario_id}>
                                      <h4>
                                        {l.label} — {t.student.attemptCount(own.length)}
                                        {/* A real separator, not a margin. The
                                            two run together when read aloud
                                            otherwise: "3 attemptsNo attempts
                                            left". */}
                                        {left !== null && ' · '}
                                        {left !== null && (
                                          <span className={`attempts-left${left === 0 ? ' is-spent' : ''}`}>
                                            {left === 0
                                              ? t.student.noAttemptsLeft
                                              : t.student.attemptsLeft(left)}
                                          </span>
                                        )}
                                        {/* The date sits beside the count, not
                                            instead of it: "2 attempts left,
                                            back on 22 October" is two different
                                            facts and a student needs both. */}
                                        {waiting && left !== 0 && (
                                          <>
                                            {' · '}
                                            <span className="attempts-left is-waiting">
                                              {t.student.cooldownUntil(untilLabel(waiting))}
                                            </span>
                                          </>
                                        )}
                                      </h4>
                                      {newestFirst.map((s) => {
                                        const score =
                                          s.avg_score == null ? null : Number(s.avg_score);
                                        const prev = own.find(
                                          (x) => x.attempt_number === s.attempt_number - 1
                                        );
                                        const prevScore =
                                          prev?.avg_score == null ? null : Number(prev.avg_score);
                                        const delta =
                                          score != null && prevScore != null
                                            ? score - prevScore
                                            : null;
                                        const kind =
                                          delta == null
                                            ? ''
                                            : delta > 0.05
                                            ? 'up'
                                            : delta < -0.05
                                            ? 'down'
                                            : 'flat';
                                        const total =
                                          l.scenario.question_count ?? sessionLength;
                                        const inProgress = s.status === 'in_progress';
                                        return (
                                          <div className="attempt" key={s.id}>
                                            <span className="n">
                                              {t.student.attempt(s.attempt_number)}
                                            </span>
                                            <span className="when">
                                              {new Date(s.started_at).toLocaleDateString(locale, {
                                                day: 'numeric',
                                                month: 'short',
                                              })}
                                            </span>
                                            {inProgress ? (
                                              <>
                                                <span className="status-pill status-in_progress">
                                                  {t.common.status.inProgress}
                                                </span>
                                                <span className="progress-mini">
                                                  <span className="progress-track">
                                                    <i
                                                      style={{
                                                        width: `${
                                                          ((s.answered_count ?? 0) / total) * 100
                                                        }%`,
                                                      }}
                                                    />
                                                  </span>
                                                  {s.answered_count ?? 0}/{total}
                                                </span>
                                              </>
                                            ) : (
                                              <>
                                                <ScoreCell score={score} locale={locale} />
                                                <span className={`score-delta ${kind}`}>
                                                  {delta == null
                                                    ? ''
                                                    : `${delta > 0 ? '+' : ''}${delta
                                                        .toFixed(2)
                                                        .replace(
                                                          '.',
                                                          locale.startsWith('en') ? '.' : ','
                                                        )}`}
                                                </span>
                                              </>
                                            )}
                                            <span className="attempt-grow" />
                                            <button
                                              className="button ghost small"
                                              onClick={() =>
                                                navigate(`/student/sessions/${s.id}`)
                                              }
                                            >
                                              {inProgress ? t.student.resume : t.student.review}
                                            </button>
                                          </div>
                                        );
                                      })}
                                      <p className="attempt-foot">
                                        <button
                                          className="button ghost small"
                                          disabled={startingId !== null || spent}
                                          onClick={() =>
                                            startScenario(l.scenario.scenario_id)
                                          }
                                        >
                                          {startingId === l.scenario.scenario_id
                                            ? t.student.starting
                                            : t.student.startAttempt(next)}
                                        </button>
                                        {/* Why the button is dead, next to the
                                            button. A disabled control with the
                                            reason somewhere else on the page is
                                            a control with no reason. */}
                                        {block && (
                                          <span className="attempt-blocked">{block.message}</span>
                                        )}
                                      </p>
                                    </div>
                                  );
                                })}
                                <p className="attempt-caveat">{t.student.repeatCaveat}</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
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

/** Score with its band and bar. Bands are the same coarse three the teacher
 *  views use — the model is not precise enough to justify finer shading. */
function ScoreCell({ score, locale }) {
  if (score == null) return <span className="score-empty">—</span>;
  const band = score < 2.5 ? 'is-low' : score < 3.5 ? 'is-mid' : 'is-high';
  return (
    <span className={`score ${band}`}>
      <b>{score.toFixed(2).replace('.', locale.startsWith('en') ? '.' : ',')}</b>
      <span className="score-track">
        <i style={{ width: `${Math.max(0, Math.min(100, (score / 5) * 100))}%` }} />
      </span>
    </span>
  );
}
