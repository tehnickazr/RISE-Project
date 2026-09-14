import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import { localized, normalizeLanguage, useT } from '../i18n/index.js';
import logo from '../assets/images/Logo_Rise.svg';
import UserMenu from '../components/UserMenu.jsx';
import Combobox from '../components/Combobox.jsx';
import TeacherTabs from '../components/TeacherTabs.jsx';

const LANGUAGE_NAMES = { sr: 'Srpski', en: 'English', fr: 'Français', pt: 'Português' };

/** A scenario's `language` column can list several, comma separated. */
function languagesOf(scenario) {
  return (scenario.language ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function TeacherContent() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const lang = normalizeLanguage(user?.preferred_language) || 'en';

  const [scenarios, setScenarios] = useState(null);
  const [error, setError] = useState(null);
  const [filterSector, setFilterSector] = useState('');
  const [filterScenario, setFilterScenario] = useState('');
  const [filterLanguage, setFilterLanguage] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    api.scenarios()
      .then((data) => setScenarios(data.scenarios))
      .catch((err) => setError(err.message));
  }, []);

  const titleOf = (s) => localized(s, 'title', lang) || s.scenario_id;

  const options = useMemo(() => {
    const sectors = new Map();
    const names = new Map();
    const languages = new Set();
    const levels = new Set();
    (scenarios ?? []).forEach((s) => {
      if (s.sector) sectors.set(s.sector, s.sector);
      names.set(s.scenario_id, titleOf(s));
      languagesOf(s).forEach((l) => languages.add(l));
      if (s.difficulty) levels.add(s.difficulty);
    });
    const sorted = (map) =>
      [...map.entries()].map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    return {
      sectors: sorted(sectors),
      names: sorted(names),
      languages: [...languages].sort(),
      levels: [...levels].sort(),
    };
  }, [scenarios, lang]);

  const filtered = useMemo(() => {
    if (!scenarios) return [];
    return scenarios
      .filter((s) => {
        if (filterSector && s.sector !== filterSector) return false;
        if (filterScenario && s.scenario_id !== filterScenario) return false;
        if (filterLanguage && !languagesOf(s).includes(filterLanguage)) return false;
        if (filterLevel && s.difficulty !== filterLevel) return false;
        if (filterStatus === 'active' && s.active === false) return false;
        if (filterStatus === 'retired' && s.active !== false) return false;
        return true;
      })
      .sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
  }, [scenarios, filterSector, filterScenario, filterLanguage, filterLevel, filterStatus, lang]);

  return (
    <main>
      <header className="page-header">
        <img className="brand-logo" src={logo} alt="RISE" />
        <UserMenu user={user} logout={logout} label={t.common.signOut} accountLabel={t.account.menuLink} />
      </header>

      <TeacherTabs />

      <h1>{t.content.title}</h1>
      <p className="page-intro">{t.content.intro}</p>

      {error && <p className="error">{error}</p>}
      {!scenarios && !error && <p>{t.common.loading}</p>}

      {scenarios && (
        <div className="panel">
          <div className="filters">
            <Combobox
              label={t.content.filterScenario}
              value={filterScenario}
              onChange={setFilterScenario}
              options={options.names}
              allLabel={t.content.allScenarios}
              placeholder={t.teacher.filterSearch}
              noResults={t.teacher.filterNoMatch}
              clearLabel={t.teacher.filterClear}
              minWidth={260}
            />
            <Combobox
              label={t.content.filterSector}
              value={filterSector}
              onChange={setFilterSector}
              options={options.sectors}
              allLabel={t.content.allSectors}
              placeholder={t.teacher.filterSearch}
              noResults={t.teacher.filterNoMatch}
              clearLabel={t.teacher.filterClear}
              minWidth={240}
            />
            <label>
              {t.content.filterLevel}
              <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
                <option value="">{t.content.allLevels}</option>
                {options.levels.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label>
              {t.content.filterStatus}
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">{t.content.statusAll}</option>
                <option value="active">{t.content.statusActive}</option>
                <option value="retired">{t.content.statusRetired}</option>
              </select>
            </label>
            <label>
              {t.content.filterLanguage}
              <select value={filterLanguage} onChange={(e) => setFilterLanguage(e.target.value)}>
                <option value="">{t.content.allLanguages}</option>
                {options.languages.map((l) => (
                  <option key={l} value={l}>{LANGUAGE_NAMES[l] ?? l}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Filtered count against the whole catalogue. Deliberately no retired
              tally beside it: that number is global, so under a language or sector
              filter it read as "11 of these 19 are retired" when none of them were. */}
          <p className="result-count">
            {t.content.resultCount(filtered.length, scenarios.length)}
          </p>

          {filtered.length === 0 ? (
            <p className="empty-state">{t.content.none}</p>
          ) : (
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>{t.content.scenario}</th>
                  <th>{t.content.sector}</th>
                  <th>{t.content.level}</th>
                  <th>{t.content.languages}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.scenario_id} className={s.active === false ? 'is-retired' : undefined}>
                    <td data-label={t.content.scenario}>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => navigate(`/teacher/content/${encodeURIComponent(s.scenario_id)}`)}
                      >
                        {titleOf(s)}
                      </button>
                      {s.active === false && (
                        <span className="retired-pill">{t.content.retired}</span>
                      )}
                      <span className="row-sub">{s.scenario_id}</span>
                    </td>
                    <td data-label={t.content.sector}>{s.sector || '—'}</td>
                    <td data-label={t.content.level}>{s.difficulty || '—'}</td>
                    <td data-label={t.content.languages}>
                      {languagesOf(s).map((l) => (
                        <span className="lang-chip" key={l}>{l.toUpperCase()}</span>
                      ))}
                    </td>
                    <td className="table-action">
                      <button
                        className="button ghost"
                        onClick={() => navigate(`/teacher/content/${encodeURIComponent(s.scenario_id)}`)}
                      >
                        {t.content.open}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </main>
  );
}
