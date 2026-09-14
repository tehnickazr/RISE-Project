import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useT } from '../i18n/index.js';

/**
 * Who a student writes to when something goes wrong.
 *
 * Not the data protection officer, which lives on the privacy notice page and
 * is linked from here rather than copied. The separation is the point: a login
 * problem sent to the officer is a nuisance, but an erasure request sent to an
 * IT helpdesk starts a one-month statutory clock in an inbox with no authority
 * to answer it.
 *
 * Unlike the privacy notice, nothing here is counted or flagged. A missing
 * address is an operational gap, not a legal one — the help sheet simply shows
 * one fewer entry, which is better than showing a student `<email>`.
 */
export default function SupportContactsSettings() {
  const t = useT();
  const [platform, setPlatform] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const apply = (d) => {
    setPlatform(d.platform ?? { support_name: null, support_email: null });
    setForm({
      support_name: d.settings.support_name ?? '',
      support_email: d.settings.support_email ?? '',
      support_phone: d.settings.support_phone ?? '',
      support_hours: d.settings.support_hours ?? '',
    });
  };

  useEffect(() => {
    api.supportSettings().then(apply).catch((e) => setError(e.message));
  }, []);

  const set = (patch) => {
    setSaved(false);
    setForm((f) => ({ ...f, ...patch }));
  };

  const onSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const blank = (v) => (v.trim() === '' ? null : v.trim());
    try {
      apply(
        await api.setSupportSettings({
          support_name: blank(form.support_name),
          support_email: blank(form.support_email),
          support_phone: blank(form.support_phone),
          support_hours: blank(form.support_hours),
        })
      );
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!form) {
    return (
      <section className="panel">
        <h2>{t.support.title}</h2>
        <p>{error ? <span className="error">{error}</span> : t.common.loading}</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>{t.support.title}</h2>
      <p className="section-intro">{t.support.intro}</p>

      <form onSubmit={onSave} className="settings-form">
        <fieldset className="limit-field">
          <legend>{t.support.school}</legend>
          <p className="field-hint">{t.support.schoolHint}</p>
          <label>
            <span>{t.support.name}</span>
            <input
              value={form.support_name}
              disabled={busy}
              onChange={(e) => set({ support_name: e.target.value })}
            />
            <span className="sub">{t.support.nameHint}</span>
          </label>
          <label>
            <span>{t.support.email}</span>
            <input
              type="email"
              value={form.support_email}
              disabled={busy}
              onChange={(e) => set({ support_email: e.target.value })}
            />
            <span className="sub">{t.support.emailHint}</span>
          </label>
          <label>
            <span>{t.support.phone} <em>{t.privacySettings.optional}</em></span>
            <input
              value={form.support_phone}
              disabled={busy}
              onChange={(e) => set({ support_phone: e.target.value })}
            />
          </label>
          <label>
            <span>{t.support.hours} <em>{t.privacySettings.optional}</em></span>
            <input
              value={form.support_hours}
              disabled={busy}
              placeholder={t.support.hoursPlaceholder}
              onChange={(e) => set({ support_hours: e.target.value })}
            />
            <span className="sub">{t.support.hoursHint}</span>
          </label>
        </fieldset>

        {/* Read-only for the same reason the platform's interview limits are:
            one address answered by one team, and a school editing it would
            change who answers for every other school's students. */}
        <fieldset className="limit-field">
          <legend>{t.support.platform}</legend>
          <p className="field-hint">{t.support.platformHint}</p>
          {platform?.support_email ? (
            <p className="readonly-contact">
              <strong>{platform.support_name || t.support.platformFallbackName}</strong>
              <a href={`mailto:${platform.support_email}`}>{platform.support_email}</a>
            </p>
          ) : (
            <p className="field-hint">{t.support.platformUnset}</p>
          )}
          <p className="sub">{t.support.platformChange}</p>
        </fieldset>

        <button className="button primary" type="submit" disabled={busy}>
          {busy ? t.limits.saving : t.limits.save}
        </button>
        {error && <p className="error">{error}</p>}
        {saved && <p className="success-message">{t.limits.saved}</p>}
      </form>

      <p className="field-hint">{t.support.dpoPointer}</p>
    </section>
  );
}
