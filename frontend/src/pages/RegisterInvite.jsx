import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { NOTICE_VERSION, isStaffRole } from '../content/notice.js';
import { useT } from '../i18n/index.js';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import logo from '../assets/images/Logo_Rise.svg';

export default function RegisterInvite() {
  const { user, loading, login } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [invitation, setInvitation] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  // No account exists yet, so the language comes from the invitation the teacher
  // created. Sending someone a Serbian invitation and then an English screen was
  // an oversight, not a decision.
  const t = useT(invitation?.preferred_language);
  const [error, setError] = useState(null);
  // A link that cannot be used is not the same thing as a form that failed, and
  // it needs a different screen. `dead` holds why, and the language the person
  // was invited in, so the explanation is not in English at the one moment they
  // are already confused.
  const [dead, setDead] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setDead({ code: 'notFound', language: null });
      return;
    }
    api
      .invitation(token)
      .then((data) => setInvitation(data.invitation))
      .catch((err) => {
        if (err.code === 'expired' || err.code === 'accepted' || err.code === 'notFound') {
          setDead({ code: err.code, language: err.language });
        } else {
          setError(err.message);
        }
      });
  }, [token]);

  /**
   * Why the button is disabled, or null when it is not.
   *
   * A disabled button with no explanation is the worst state this form can be
   * in: two filled-looking password boxes and nothing happening. Safari's
   * password autofill can put text in a field without React seeing it, so the
   * page believes the password is empty while the person reading it can see
   * their password sitting right there. Naming the unmet condition turns a
   * dead button into an instruction.
   */
  const blocker = useMemo(() => {
    if (password.length === 0) return t.register.needPassword;
    if (password.length < 10) return t.register.needLonger;
    if (password !== confirmPassword) return t.register.needMatch;
    if (!acknowledged) return t.register.needAck;
    return null;
  }, [password, confirmPassword, acknowledged, t]);

  if (!loading && user) return <Navigate to="/" replace />;

  const onSubmit = async (event) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.acceptInvitation(token, password, {
        notice_version: NOTICE_VERSION,
        notice_language: invitation.preferred_language || 'en',
      });
      await login(result.user.email, password);
      navigate('/', { replace: true });
    } catch (err) {
      // The link can die between this page loading and the form being sent.
      if (err.code === 'expired' || err.code === 'accepted' || err.code === 'notFound') {
        setDead({ code: err.code, language: err.language ?? invitation?.preferred_language });
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (dead) return <DeadInvitation code={dead.code} language={dead.language} />;

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <img className="auth-logo" src={logo} alt="RISE" />
        <p className="login-hint">{t.register.title}</p>

        {!invitation && !error && <p>{t.common.loading}</p>}
        {error && <p className="error">{error}</p>}

        {invitation && (
          <form onSubmit={onSubmit} className="auth-form">
            <div className="invite-summary">
              <strong>{invitation.display_name}</strong>
              <span>{invitation.email}</span>
              <span className="role-pill">{invitation.role}</span>
            </div>
            <label>
              {t.register.password}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={10}
                required
                autoFocus
              />
            </label>
            <label>
              {t.register.confirmPassword}
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={10}
                required
              />
            </label>
            {/* "I have read", never "I agree". The processing does not rest on
                consent -- a student can neither refuse nor withdraw -- and a box
                implying otherwise would misrepresent the basis. What is stored is
                the acknowledgement and the notice version, so that a material
                change can re-inform everyone. See DPIA.md section 4.1. */}
            <label className="ack-box">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              {/* One link, because it is one document: the rules for using RISE
                  are a section of the notice, and two links implied two texts. */}
              <span>
                {t.register.ackBefore}
                <Link
                  to={
                    isStaffRole(invitation.role)
                      ? '/privacy/staff'
                      : `/privacy/${invitation.preferred_language || 'en'}`
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.register.ackLink}
                </Link>
                {t.register.ackAfter}
              </span>
            </label>
            <p className="ack-note">{t.register.ackNote}</p>
            {blocker && <p className="field-hint">{blocker}</p>}
            <button className="button primary" type="submit" disabled={busy || blocker !== null}>
              {busy ? t.register.creating : t.register.create}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

/**
 * The screen for a link that cannot be used.
 *
 * This replaces the form rather than sitting above it. Leaving two password
 * boxes on screen under a message saying the invitation is dead invites
 * someone to fill them in and press a button that cannot work — which is how
 * the reported failure went: a student reopened the invitation email to find
 * the address of the platform, clicked the link out of habit, and had nowhere
 * to go from the page it left them on.
 *
 * **`accepted` is deliberately not an error.** It is the commonest of the three
 * and it means the account exists and works. Styling it red would tell a
 * student something is wrong with them when the only thing wrong is which
 * email they opened.
 */
function DeadInvitation({ code, language }) {
  const t = useT(language);
  const copy = t.register.dead[code] ?? t.register.dead.notFound;
  const isProblem = code !== 'accepted';

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <img className="auth-logo" src={logo} alt="RISE" />
        <div className={`invite-dead${isProblem ? ' is-problem' : ''}`}>
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
        </div>
        {/* The way out, which is the entire point of this screen. */}
        <Link className="button primary invite-dead-action" to="/login">
          {t.register.dead.signIn}
        </Link>
      </section>
    </main>
  );
}
