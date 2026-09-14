import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import { useT } from '../i18n/index.js';
import { LANGUAGES } from '../lib/orgFields.js';

const EMPTY = { display_name: '', email: '' };

/**
 * A teacher inviting a student.
 *
 * The role is shown and disabled rather than hidden. A form that silently
 * decides something on your behalf leaves you wondering what it decided; one
 * that shows "Student" greyed out with a line of explanation answers the
 * question before it is asked — and it is the honest picture of the rule, which
 * is about who may be invited rather than about which form you are looking at.
 *
 * The language is not disabled, because a school's language is not always its
 * students': a French school may have an arriving student who reads Portuguese,
 * and there is no reason to make that a conversation with an administrator.
 *
 * After sending, the dialogue stays open and offers to invite another. A
 * teacher enrolling a class is doing this twenty times in a row, and closing
 * the dialogue after each one would make them click the button twenty times.
 */
export default function InviteStudent({ onInvited }) {
  const { user } = useAuth();
  const t = useT().teacher.invite;

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sentTo, setSentTo] = useState(null);
  const [form, setForm] = useState({ ...EMPTY, preferred_language: 'en' });

  const schoolLanguage = () => user?.org_default_language || user?.preferred_language || 'en';

  const change = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const openDialog = () => {
    setError(null);
    setSentTo(null);
    // The school's own language, not English: the invitation email is sent in
    // whatever this says, and a Serbian school inviting a Serbian student in
    // English is a small daily irritation nobody asked for.
    setForm({ ...EMPTY, preferred_language: schoolLanguage() });
    setOpen(true);
  };

  const closeDialog = () => {
    if (busy) return;
    setOpen(false);
    setError(null);
  };

  const another = () => {
    setSentTo(null);
    setError(null);
    setForm({ ...EMPTY, preferred_language: schoolLanguage() });
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.inviteStudent(form);
      setSentTo(form.email);
      onInvited?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="button primary" type="button" onClick={openDialog}>
        {t.open}
      </button>

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeDialog}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-student-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="invite-student-title">{t.title}</h2>
              <button
                className="button ghost"
                type="button"
                onClick={closeDialog}
                disabled={busy}
                aria-label={t.close}
              >
                {t.close}
              </button>
            </div>

            {sentTo ? (
              <>
                <p className="success-message">{t.sent(sentTo)}</p>
                <div className="modal-actions">
                  <button className="button secondary" type="button" onClick={another}>
                    {t.another}
                  </button>
                  <button className="button primary" type="button" onClick={closeDialog}>
                    {t.done}
                  </button>
                </div>
              </>
            ) : (
              <form className="invite-form modal-invite-form" onSubmit={submit}>
                <p className="section-intro">{t.intro}</p>
                <label>
                  {t.name}
                  <input
                    value={form.display_name}
                    onChange={(e) => change('display_name', e.target.value)}
                    required
                    autoFocus
                  />
                  <span className="field-hint">{t.nameHint}</span>
                </label>
                <label>
                  {t.email}
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => change('email', e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                </label>
                <label>
                  {t.role}
                  {/* One option and disabled. The restriction is enforced by the
                      endpoint, which has no role field at all — this is the
                      interface telling the truth about it, not the place it is
                      decided. */}
                  <select value="student" disabled>
                    <option value="student">{t.roleStudent}</option>
                  </select>
                  <span className="field-hint">{t.roleNote}</span>
                </label>
                <label>
                  {t.language}
                  <select
                    value={form.preferred_language}
                    onChange={(e) => change('preferred_language', e.target.value)}
                  >
                    {/* Each language in its own name, never translated: a
                        Portuguese speaker should recognise "Português"
                        whatever the interface language happens to be. */}
                    {LANGUAGES.map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                  <span className="field-hint">{t.languageNote}</span>
                </label>
                {error && <p className="error">{error}</p>}
                <div className="modal-actions">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={closeDialog}
                    disabled={busy}
                  >
                    {t.cancel}
                  </button>
                  <button className="button primary" type="submit" disabled={busy}>
                    {busy ? t.sending : t.send}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
