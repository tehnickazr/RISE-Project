import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useT } from '../i18n/index.js';

/**
 * Where a school fills in the parts of the privacy notice only it can answer.
 *
 * Two kinds of field, and the distinction is the whole design:
 *
 *   — A name, an address or an email reads the same in every language, so it is
 *     typed once and rendered verbatim into all four notices.
 *   — A retention period does not. Typing "two years" into a box would put those
 *     English words into the Serbian, French and Portuguese notices, so a period
 *     is a number and a unit, and the sentence is assembled per language at
 *     render time. Lawful basis is a fixed choice for the same reason, and
 *     because the notice must name a basis the GDPR recognises rather than one
 *     somebody typed.
 *
 * Nothing here is required to save. A half-filled notice is the state this page
 * exists to fix; refusing the save would leave an administrator unable to record
 * the three things they know because they are still chasing the fourth.
 */

const PERIOD_UNITS = ['days', 'months', 'years'];

/** A period is two fields or nothing — half of one renders no sentence. */
function Period({ label, hint, value, unit, onChange, disabled, flagged }) {
  const t = useT();
  return (
    <label>
      <span>{label}</span>
      {hint && <span className="sub">{hint}</span>}
      <span className="period-row">
        <input
          type="number"
          min="1"
          max="999"
          className={`period-n${flagged ? ' is-gap' : ''}`}
          value={value ?? ''}
          disabled={disabled}
          placeholder="—"
          onChange={(e) => {
            const n = e.target.value === '' ? null : Number(e.target.value);
            onChange(Number.isFinite(n) ? n : null, unit);
          }}
        />
        <select
          value={unit ?? 'years'}
          disabled={disabled}
          onChange={(e) => onChange(value, e.target.value)}
        >
          {PERIOD_UNITS.map((u) => (
            <option key={u} value={u}>{t.privacySettings.units[u]}</option>
          ))}
        </select>
      </span>
    </label>
  );
}

export default function PrivacyNoticeSettings() {
  const t = useT();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const apply = (d) => {
    setData(d);
    setForm({
      ...d.settings,
      // The authority is suggested from the school's country, never written
      // into the row on its behalf. Filling the box is how an administrator
      // agrees to it; leaving it is how they notice it is wrong.
      supervisory_authority: d.settings.supervisory_authority ?? d.suggested_authority ?? '',
    });
  };

  useEffect(() => {
    api.privacySettings().then(apply).catch((e) => setError(e.message));
  }, []);

  const set = (patch) => {
    setSaved(false);
    setForm((f) => ({ ...f, ...patch }));
  };

  const gapFor = (field) => (data?.gaps ?? []).some((g) => g.field === field);

  const onSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const blank = (v) => (typeof v === 'string' && v.trim() === '' ? null : v ?? null);
    try {
      apply(
        await api.setPrivacySettings({
          short_name: blank(form.short_name),
          legal_name: blank(form.legal_name),
          dpo_name: blank(form.dpo_name),
          dpo_email: blank(form.dpo_email),
          dpo_phone: blank(form.dpo_phone),
          lawful_basis_students: blank(form.lawful_basis_students),
          lawful_basis_staff: blank(form.lawful_basis_staff),
          retention_answers_value: form.retention_answers_value ?? null,
          retention_answers_unit: form.retention_answers_value ? form.retention_answers_unit ?? 'years' : null,
          retention_account_value: form.retention_account_value ?? null,
          retention_account_unit: form.retention_account_value ? form.retention_account_unit ?? 'years' : null,
          retention_staff_value: form.retention_staff_value ?? null,
          retention_staff_unit: form.retention_staff_value ? form.retention_staff_unit ?? 'years' : null,
          supervisory_authority: blank(form.supervisory_authority),
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
        <h2>{t.privacySettings.title}</h2>
        <p>{error ? <span className="error">{error}</span> : t.common.loading}</p>
      </section>
    );
  }

  const studentGaps = (data.gaps ?? []).filter((g) => g.audience !== 'staff').length;
  const totalGaps = (data.gaps ?? []).length;

  return (
    <section className="panel">
      <h2>{t.privacySettings.title}</h2>
      <p className="section-intro">{t.privacySettings.intro}</p>

      {/* The count, and who it spoils the notice for. An administrator who has
          to open the page to discover it is unfinished will not open it — so
          this is also carried on the rail. */}
      {totalGaps > 0 ? (
        <p className={`gap-banner${studentGaps > 0 ? ' is-student' : ''}`}>
          <strong>{t.privacySettings.gapCount(totalGaps)}</strong>
          <span>
            {studentGaps > 0
              ? t.privacySettings.gapStudent(studentGaps)
              : t.privacySettings.gapStaffOnly}
          </span>
        </p>
      ) : (
        <p className="gap-banner is-done">
          <strong>{t.privacySettings.gapNone}</strong>
        </p>
      )}

      <form onSubmit={onSave} className="settings-form">

        <fieldset className="limit-field">
          <legend>{t.privacySettings.school}</legend>
          <p className="field-hint">{t.privacySettings.schoolHint}</p>
          <label>
            <span>{t.privacySettings.shortName}</span>
            <input
              className={gapFor('short_name') ? 'is-gap' : undefined}
              value={form.short_name ?? ''}
              disabled={busy}
              onChange={(e) => set({ short_name: e.target.value })}
            />
            <span className="sub">{t.privacySettings.shortNameHint}</span>
          </label>
          <label>
            <span>{t.privacySettings.legalName}</span>
            <textarea
              rows={3}
              className={gapFor('legal_name') ? 'is-gap' : undefined}
              value={form.legal_name ?? ''}
              disabled={busy}
              onChange={(e) => set({ legal_name: e.target.value })}
            />
          </label>
        </fieldset>

        <fieldset className="limit-field">
          <legend>{t.privacySettings.dpo}</legend>
          <p className="field-hint">{t.privacySettings.dpoHint}</p>
          <label>
            <span>{t.privacySettings.name}</span>
            <input
              className={gapFor('dpo_name') ? 'is-gap' : undefined}
              value={form.dpo_name ?? ''}
              disabled={busy}
              onChange={(e) => set({ dpo_name: e.target.value })}
            />
          </label>
          <label>
            <span>{t.privacySettings.email}</span>
            <input
              type="email"
              className={gapFor('dpo_email') ? 'is-gap' : undefined}
              value={form.dpo_email ?? ''}
              disabled={busy}
              onChange={(e) => set({ dpo_email: e.target.value })}
            />
          </label>
          {/* Never required, never flagged, and left out of the assembled
              sentence entirely when blank. Article 13 asks for a way to reach
              the officer; it does not ask for a phone line. */}
          <label>
            <span>{t.privacySettings.phone} <em>{t.privacySettings.optional}</em></span>
            <input
              value={form.dpo_phone ?? ''}
              disabled={busy}
              onChange={(e) => set({ dpo_phone: e.target.value })}
            />
            <span className="sub">{t.privacySettings.phoneHint}</span>
          </label>
        </fieldset>

        <fieldset className="limit-field">
          <legend>{t.privacySettings.basis}</legend>
          <p className="field-hint">{t.privacySettings.basisHint}</p>
          <label>
            <span>{t.privacySettings.basisStudents}</span>
            <select
              className={gapFor('lawful_basis_students') ? 'is-gap' : undefined}
              value={form.lawful_basis_students ?? ''}
              disabled={busy}
              onChange={(e) => set({ lawful_basis_students: e.target.value || null })}
            >
              <option value="">{t.privacySettings.choose}</option>
              <option value="public_task">{t.privacySettings.bases.public_task}</option>
              <option value="legal_obligation">{t.privacySettings.bases.legal_obligation}</option>
              <option value="consent">{t.privacySettings.bases.consent}</option>
            </select>
          </label>
          <label>
            <span>{t.privacySettings.basisStaff}</span>
            <select
              className={gapFor('lawful_basis_staff') ? 'is-gap' : undefined}
              value={form.lawful_basis_staff ?? ''}
              disabled={busy}
              onChange={(e) => set({ lawful_basis_staff: e.target.value || null })}
            >
              <option value="">{t.privacySettings.choose}</option>
              <option value="public_task">{t.privacySettings.bases.public_task}</option>
              <option value="contract">{t.privacySettings.bases.contract}</option>
            </select>
          </label>
        </fieldset>

        <fieldset className="limit-field">
          <legend>{t.privacySettings.retention}</legend>
          <p className="field-hint">{t.privacySettings.retentionHint}</p>
          <Period
            label={t.privacySettings.retentionAnswers}
            value={form.retention_answers_value}
            unit={form.retention_answers_unit}
            disabled={busy}
            flagged={gapFor('retention_answers')}
            onChange={(v, u) => set({ retention_answers_value: v, retention_answers_unit: u })}
          />
          <Period
            label={t.privacySettings.retentionAccount}
            value={form.retention_account_value}
            unit={form.retention_account_unit}
            disabled={busy}
            flagged={gapFor('retention_account')}
            onChange={(v, u) => set({ retention_account_value: v, retention_account_unit: u })}
          />
          <Period
            label={t.privacySettings.retentionStaff}
            hint={t.privacySettings.retentionStaffHint}
            value={form.retention_staff_value}
            unit={form.retention_staff_unit}
            disabled={busy}
            flagged={gapFor('retention_staff')}
            onChange={(v, u) => set({ retention_staff_value: v, retention_staff_unit: u })}
          />
        </fieldset>

        <fieldset className="limit-field">
          <legend>{t.privacySettings.authority}</legend>
          <p className="field-hint">{t.privacySettings.authorityHint}</p>
          <label>
            <span>{t.privacySettings.authorityField}</span>
            <input
              className={gapFor('supervisory_authority') ? 'is-gap' : undefined}
              value={form.supervisory_authority ?? ''}
              disabled={busy}
              onChange={(e) => set({ supervisory_authority: e.target.value })}
            />
          </label>
        </fieldset>

        <button className="button primary" type="submit" disabled={busy}>
          {busy ? t.limits.saving : t.limits.save}
        </button>
        {error && <p className="error">{error}</p>}
        {saved && <p className="success-message">{t.limits.saved}</p>}
      </form>
    </section>
  );
}
