import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { browserLanguage, getTranslations } from '../i18n/index.js';
import logo from '../assets/images/Logo_Rise.svg';

/**
 * Choose a new password from a reset link.
 *
 * **In the account's own language.** The token identifies exactly who this is,
 * so the server sends their language back with the check — and shipping this
 * screen in English meant a Serbian student received a Serbian email and then
 * an English form, which is the same oversight the invitation flow already
 * records fixing once.
 *
 * The browser's language is the fallback for the moment before the check
 * returns, and for a dead link, where there is no account to ask about.
 *
 * The token is checked on load rather than on submit, so a dead link says so
 * before anyone types a password twice. Being told at the end that the last two
 * minutes were wasted is the worst version of this.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();

  const [state, setState] = useState('checking');
  const [language, setLanguage] = useState(browserLanguage());
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const t = getTranslations(language).passwordReset;

  useEffect(() => {
    if (!token) {
      setState('dead');
      return;
    }
    api
      .checkResetToken(token)
      .then((data) => {
        if (data?.language) setLanguage(data.language);
        setState('ready');
      })
      .catch(() => setState('dead'));
  }, [token]);

  const blocker =
    password.length === 0
      ? t.needPassword
      : password.length < 10
        ? t.needLonger
        : password !== confirm
          ? t.needMatch
          : null;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (blocker) return;
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(token, password);
      setState('done');
    } catch (err) {
      if (err.code === 'expired') setState('dead');
      else setError(t.failed);
    } finally {
      setBusy(false);
    }
  };

  const panel = (children) => (
    <main className="auth-page">
      <section className="auth-panel">
        <img className="auth-logo" src={logo} alt="RISE" />
        {children}
      </section>
    </main>
  );

  if (state === 'checking') return panel(<p>{t.checking}</p>);

  if (state === 'dead') {
    return panel(
      <>
        <div className="invite-dead is-problem">
          <h1>{t.deadTitle}</h1>
          <p>{t.deadBody}</p>
        </div>
        <Link className="button primary invite-dead-action" to="/forgot">
          {t.askNew}
        </Link>
      </>
    );
  }

  if (state === 'done') {
    return panel(
      <>
        <div className="invite-dead">
          <h1>{t.doneTitle}</h1>
          {/* Said plainly because it is surprising otherwise: a reset signs out
              every device, including any that whoever prompted it was holding. */}
          <p>{t.doneBody}</p>
        </div>
        <button
          type="button"
          className="button primary invite-dead-action"
          onClick={() => navigate('/login', { replace: true })}
        >
          {t.goSignIn}
        </button>
      </>
    );
  }

  return panel(
    <>
      <h1 className="auth-heading">{t.chooseTitle}</h1>
      <form onSubmit={onSubmit} className="auth-form">
        <label>
          {t.newPassword}
          <span className="password-field">
            <input
              type={reveal ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={10}
              required
              autoFocus
              autoComplete="new-password"
            />
            <button
              type="button"
              className="password-reveal"
              onClick={() => setReveal((on) => !on)}
              aria-label={reveal ? t.hide : t.show}
              aria-pressed={reveal}
            >
              <EyeIcon off={reveal} />
            </button>
          </span>
        </label>
        <label>
          {t.repeat}
          <input
            type={reveal ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={10}
            required
            autoComplete="new-password"
          />
        </label>
        {/* Naming the unmet condition rather than disabling in silence — the
            lesson the registration form already records. */}
        {blocker && <p className="login-hint">{blocker}</p>}
        {error && <p className="error">{error}</p>}
        <button className="button primary" type="submit" disabled={busy || !!blocker}>
          {busy ? t.saving : t.save}
        </button>
      </form>
    </>
  );
}

function EyeIcon({ off }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M1.6 12S5.3 5.5 12 5.5 22.4 12 22.4 12 18.7 18.5 12 18.5 1.6 12 1.6 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.7" />
      {off && (
        <path d="M4 20 20 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </svg>
  );
}
