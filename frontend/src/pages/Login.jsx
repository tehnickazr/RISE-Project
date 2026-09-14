import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import logo from '../assets/images/Logo_Rise.svg';

// Login is shown before we know the user's preferred language, so the UI is
// English-first and the product subtitle includes the supported translations.
export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Reveal exists for phones. Typing a password you cannot see on a soft
  // keyboard that shows each character for half a second and then hides it is
  // how a student ends up locked out of a platform whose password they know —
  // watched happening during the Serbian testing on 10 September.
  const [reveal, setReveal] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <img className="auth-logo" src={logo} alt="RISE" />
        <p className="login-hint">
          Job Interview AI Coach · AI kouč za razgovor za posao · Coach IA
          d'entretien d'embauche · Coach de IA para entrevistas de emprego
        </p>
        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Email
            {/* A phone keyboard capitalises the first letter of a field and
                autocorrects what looks like a word. The server lowercases the
                address before comparing, so capitals are survivable — a
                "corrected" spelling is not. */}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <label>
            Password
            <span className="password-field">
              <input
                type={reveal ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              {/* An icon rather than the word "Show": this page is English-only
                  by design, because the language is a property of the account
                  and there is no account yet. An eye is the one label a
                  fifteen-year-old in Zrenjanin reads as easily as one in
                  Arras. The accessible name stays English, like the rest. */}
              <button
                type="button"
                className="password-reveal"
                onClick={() => setReveal((on) => !on)}
                aria-label={reveal ? 'Hide password' : 'Show password'}
                aria-pressed={reveal}
                title={reveal ? 'Hide password' : 'Show password'}
              >
                <EyeIcon off={reveal} />
              </button>
            </span>
          </label>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
          {err && <p className="error">{err}</p>}
        </form>
        <p className="auth-alt">
          <Link to="/forgot">Forgot your password?</Link>
        </p>
      </section>
    </main>
  );
}

/**
 * An eye, struck through when the password is visible.
 *
 * Inline rather than an icon font or an emoji: 🙈 renders as a monkey on some
 * Android builds and as nothing on others, and a webfont for one glyph is a
 * render-blocking request on the first screen anyone sees.
 */
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
