import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { browserLanguage, getTranslations } from '../i18n/index.js';
import logo from '../assets/images/Logo_Rise.svg';

/**
 * Ask for a reset link.
 *
 * **Drawn in the browser's language, not the account's** — because nobody has
 * said who they are yet, and asking the server which language an address
 * belongs to would answer the question this endpoint exists to refuse: whether
 * that address has an account at all. A guess from the browser leaks nothing
 * and is right far more often than English-for-everyone.
 *
 * The confirmation is deliberately the same whatever happened. Telling someone
 * "no account with that address" turns this form into a way of asking the
 * platform which children are registered here. The cost is that a typo looks
 * like success, which is why the text says to check the address rather than
 * promising a message is on its way.
 */
export default function ForgotPassword() {
  const t = getTranslations(browserLanguage()).passwordReset;
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.forgotPassword(email);
    } catch {
      // Even a failure shows the same confirmation. A rate limit or an outage
      // must not become a signal about whether the address exists.
    } finally {
      setSent(true);
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <img className="auth-logo" src={logo} alt="RISE" />
        {sent ? (
          <>
            <div className="invite-dead">
              <h1>{t.sentTitle}</h1>
              <p>{t.sentBody}</p>
              <p>{t.sentNothing}</p>
            </div>
            <Link className="button primary invite-dead-action" to="/login">
              {t.backToSignIn}
            </Link>
          </>
        ) : (
          <>
            <h1 className="auth-heading">{t.forgotTitle}</h1>
            <p className="login-hint">{t.forgotIntro}</p>
            <form onSubmit={onSubmit} className="auth-form">
              <label>
                {t.email}
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
              <button className="button primary" type="submit" disabled={busy}>
                {busy ? t.sending : t.send}
              </button>
            </form>
            <p className="auth-alt">
              <Link to="/login">{t.backToSignIn}</Link>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
