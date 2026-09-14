import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import { isStaffRole } from '../content/notice.js';
import { dateLocale, normalizeLanguage, useT } from '../i18n/index.js';
import logo from '../assets/images/Logo_Rise.svg';
import UserMenu from '../components/UserMenu.jsx';

const LANGUAGES = [
  ['sr', 'Srpski'],
  ['en', 'English'],
  ['fr', 'Français'],
  ['pt', 'Português'],
];

// `dateLocale`, not the bare language code: `sr` resolves to Cyrillic in Intl,
// and Cyrillic month names beside Latin content read as a bug.
function formatDate(value, language) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(dateLocale(language), { dateStyle: 'long' });
}

export default function Account() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const lang = normalizeLanguage(user?.preferred_language) || 'en';

  const [language, setLanguage] = useState(lang);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);
  const [profileErr, setProfileErr] = useState(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [pwErr, setPwErr] = useState(null);

  const [requests, setRequests] = useState([]);
  const [reqBusy, setReqBusy] = useState(false);
  const [reqErr, setReqErr] = useState(null);

  useEffect(() => {
    api.myDataRequests().then((d) => setRequests(d.requests)).catch(() => setRequests([]));
  }, []);

  const onSaveProfile = async (e) => {
    e.preventDefault();
    setProfileBusy(true);
    setProfileErr(null);
    setProfileMsg(null);
    try {
      await api.updateMe({ preferred_language: language });
      await refreshUser?.();
      setProfileMsg(t.account.saved);
    } catch (err) {
      setProfileErr(err.message);
    } finally {
      setProfileBusy(false);
    }
  };

  const onChangePassword = async (e) => {
    e.preventDefault();
    setPwErr(null);
    setPwMsg(null);
    if (newPassword !== repeatPassword) {
      setPwErr(t.account.passwordMismatch);
      return;
    }
    setPwBusy(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setRepeatPassword('');
      setPwMsg(t.account.passwordChanged);
    } catch (err) {
      // The server answers with a code, not a sentence: an English string from
      // the API was surfacing untranslated in a Serbian page.
      setPwErr(t.account.errors[err.code] ?? err.message);
    } finally {
      setPwBusy(false);
    }
  };

  const onRequest = async (kind) => {
    setReqBusy(true);
    setReqErr(null);
    try {
      await api.createDataRequest(kind);
      setRequests((await api.myDataRequests()).requests);
    } catch (err) {
      setReqErr(err.message);
    } finally {
      setReqBusy(false);
    }
  };

  const onCancel = async (id) => {
    setReqBusy(true);
    try {
      await api.cancelDataRequest(id);
      setRequests((await api.myDataRequests()).requests);
    } catch (err) {
      setReqErr(err.message);
    } finally {
      setReqBusy(false);
    }
  };

  const canRequestData = user?.role === 'student' || user?.role === 'teacher';
  const pending = requests.filter((r) => r.status === 'pending');
  const hasOpen = (kind) => pending.some((r) => r.kind === kind);

  return (
    <main>
      <header className="page-header">
        <img className="brand-logo" src={logo} alt="RISE" />
        <UserMenu user={user} logout={logout} label={t.common.signOut} accountLabel={t.account.menuLink} />
      </header>

      <button type="button" className="button ghost" onClick={() => navigate(-1)}>
        {t.common.back}
      </button>

      <h1>{t.account.title}</h1>
      <p className="page-intro">{t.account.intro}</p>

      <div className="account-grid">
        <div>
          <section className="panel">
            <h2>{t.account.profile}</h2>
            {/* Name and sign-in name are issued by the school. They were inputs,
                which invited an edit that would not have worked. */}
            <dl className="account-facts">
              <div className="account-fact">
                <dt>{t.account.name}</dt>
                <dd>{user?.display_name}</dd>
              </div>
              <div className="account-fact">
                <dt>{t.account.signInName}</dt>
                <dd>{user?.email}</dd>
                {/* A teacher is not told to ask a teacher. Their sign-in name
                    is issued by the administrator, same as the rest of their
                    account. */}
                <span className="field-hint">
                  {isStaffRole(user?.role) ? t.account.signInHintStaff : t.account.signInHint}
                </span>
              </div>
            </dl>
            <form className="account-form" onSubmit={onSaveProfile}>
              <label>
                {t.account.language}
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {LANGUAGES.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {profileErr && <p className="error">{profileErr}</p>}
              {profileMsg && <p className="success-text">{profileMsg}</p>}
              <button className="button primary" type="submit" disabled={profileBusy}>
                {profileBusy ? t.common.saving : t.account.save}
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>{t.account.password}</h2>
            <form className="account-form" onSubmit={onChangePassword}>
              <label>
                {t.account.currentPassword}
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </label>
              <label>
                {t.account.newPassword}
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={10}
                  required
                />
                <span className="field-hint">{t.account.passwordHint}</span>
              </label>
              <label>
                {t.account.repeatPassword}
                <input
                  type="password"
                  value={repeatPassword}
                  onChange={(e) => setRepeatPassword(e.target.value)}
                  minLength={10}
                  required
                />
              </label>
              {pwErr && <p className="error">{pwErr}</p>}
              {pwMsg && <p className="success-text">{pwMsg}</p>}
              <button className="button primary" type="submit" disabled={pwBusy}>
                {pwBusy ? t.common.saving : t.account.changePassword}
              </button>
            </form>
          </section>
        </div>

        <div>
          {/* Administrators are who a request is *sent to*. Offering them a
              button to ask themselves would produce a queue item nobody can
              action any differently. The same holds for any future super-admin
              role, hence a positive check on 'student'/'teacher' rather than a
              blacklist. */}
          {canRequestData && (
          <section className="panel">
            <h2>{t.account.yourData}</h2>
            <p className="section-intro">{t.account.yourDataIntro}</p>

            {pending.length > 0 && (
              <ul className="request-list">
                {pending.map((r) => (
                  <li key={r.id} className="request-pending">
                    <span className="request-dot" aria-hidden="true" />
                    <span>
                      {/* Export requests can no longer be created, so in
                          practice this is always the erasure branch. The
                          export wording stays because a request filed before
                          the change could still be open, and labelling it
                          "you asked for your data to be deleted" would be a
                          lie shown to the one person who would know. */}
                      <b>
                        {r.kind === 'export'
                          ? t.account.pendingExport(formatDate(r.requested_at, lang))
                          : t.account.pendingErasure(formatDate(r.requested_at, lang))}
                      </b>
                      <span>{t.account.pendingDue(formatDate(r.due_at, lang))}</span>
                    </span>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => onCancel(r.id)}
                      disabled={reqBusy}
                    >
                      {t.account.cancelRequest}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {reqErr && <p className="error">{reqErr}</p>}

            <div className="account-actions">
              {/* A copy of your own data is not a request — nobody has to
                  approve you reading what you wrote. It downloads immediately,
                  which also means no member of staff opens a transcript in
                  order to hand it over. Erasure still goes to the school:
                  that one really is theirs to decide and to carry out. */}
              <a className="button secondary" href={api.myExportUrl()} download>
                {t.account.downloadData}
              </a>
              <button
                type="button"
                className="button ghost danger"
                onClick={() => onRequest('erasure')}
                disabled={reqBusy || hasOpen('erasure')}
              >
                {t.account.askErasure}
              </button>
            </div>
            <p className="field-hint">{t.account.downloadHint}</p>
            {/* Students are told nothing further: the copy downloads itself,
                and the intro already says deletion goes to the school. The
                line that used to sit here — "your teacher can do this for you"
                — described a workflow that no longer exists.

                Staff still get one line, because "the school" is vague when
                you work there: their request goes to the administrator, not to
                another teacher, who would have no power to act on it. */}
            {user?.role === 'teacher' && (
              <p className="field-hint">{t.account.askHintStaff}</p>
            )}
          </section>
          )}

          <section className="panel">
            <h2>{t.account.privacy}</h2>
            <p className="section-intro">{t.account.privacyIntro}</p>
            {/* Staff have their own notice; the student one is about interview
                answers written by a minor and says almost nothing about them. */}
            <Link className="button ghost" to={isStaffRole(user?.role) ? '/privacy/staff' : `/privacy/${lang}`}>
              {t.account.readNotice}
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
