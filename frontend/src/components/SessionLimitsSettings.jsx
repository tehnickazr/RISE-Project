import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useT } from '../i18n/index.js';

/**
 * How many interviews a student may start.
 *
 * One component for both scopes. A school administrator sets an override and
 * can hand the number back to the platform; a platform administrator sets the
 * default every school starts from and has nothing above them to inherit — so
 * the only difference between the two is whether the "use the default" choice
 * exists at all.
 *
 * Three states per field, not a number and a magic value:
 *
 *   inherit  →  null   (school only)
 *   limit n  →  n
 *   no limit →  0
 *
 * The store keeps 0 for "no limit" (see migration 0021), but nobody types it.
 * Choosing "no limit" is a radio button, and the number box next to "limit
 * this" never accepts 0 — which is what stops a zero meant as "none allowed"
 * from being read as its opposite.
 */

const MIN = 1;
const MAX = 999;

/** Stored value → the three-way state the radios work on. */
function toState(stored, fallback) {
  if (stored === null || stored === undefined) return { mode: 'inherit', value: fallback };
  if (Number(stored) === 0) return { mode: 'none', value: fallback };
  return { mode: 'limit', value: Number(stored) };
}

/** …and back. */
function toStored(state) {
  if (state.mode === 'inherit') return null;
  if (state.mode === 'none') return 0;
  return state.value;
}

function LimitField({
  id,
  label,
  hint,
  state,
  onChange,
  inheritedFrom,
  disabled,
  // "No limit" is the wrong words for a waiting period, and "days" has to sit
  // beside the box or the number means nothing on its own.
  noneLabel,
  unit,
}) {
  const t = useT();
  const set = (patch) => onChange({ ...state, ...patch });

  return (
    <fieldset className="limit-field">
      <legend>{label}</legend>
      <p className="field-hint">{hint}</p>

      {inheritedFrom !== null && (
        <label className="limit-choice">
          <input
            type="radio"
            name={id}
            checked={state.mode === 'inherit'}
            disabled={disabled}
            onChange={() => set({ mode: 'inherit' })}
          />
          <span>{t.limits.useDefault}</span>
          <span className="field-hint">{t.limits.platformDefault(inheritedFrom)}</span>
        </label>
      )}

      <label className="limit-choice">
        <input
          type="radio"
          name={id}
          checked={state.mode === 'limit'}
          disabled={disabled}
          onChange={() => set({ mode: 'limit' })}
        />
        <span>{t.limits.limitThis}</span>
        {/* A <label> names only its first labelable descendant, which here is
            the radio — so without this the number box has no accessible name at
            all and is announced as an unlabelled spin button. The field's own
            legend is the name that means something: "Attempts at the same
            interview", not "Limit this". */}
        <input
          type="number"
          className="limit-number"
          aria-label={label}
          min={MIN}
          max={MAX}
          value={state.value}
          disabled={disabled || state.mode !== 'limit'}
          onChange={(e) => {
            const n = Number(e.target.value);
            // Clamped here rather than only rejected by the endpoint: the
            // number box is the one place someone can type 0, and 0 on the way
            // in means the opposite of what it means in the store.
            set({ value: Number.isFinite(n) ? Math.min(MAX, Math.max(MIN, Math.round(n))) : MIN });
          }}
        />
        {unit && <span className="field-hint">{unit}</span>}
      </label>

      <label className="limit-choice">
        <input
          type="radio"
          name={id}
          checked={state.mode === 'none'}
          disabled={disabled}
          onChange={() => set({ mode: 'none' })}
        />
        <span>{noneLabel ?? t.limits.unlimited}</span>
      </label>
    </fieldset>
  );
}

export default function SessionLimitsSettings({ scope = 'org' }) {
  const t = useT();
  const isPlatform = scope === 'platform';

  const [platform, setPlatform] = useState(null);
  const [attempts, setAttempts] = useState({ mode: 'inherit', value: 3 });
  const [total, setTotal] = useState({ mode: 'inherit', value: 15 });
  const [cooldown, setCooldown] = useState({ mode: 'inherit', value: 7 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const apply = (data) => {
    setPlatform(data.platform);
    if (isPlatform) {
      setAttempts(toState(data.platform.attempts_per_scenario, 3));
      setTotal(toState(data.platform.total_interviews, 15));
      setCooldown(toState(data.platform.cooldown_days, 7));
    } else {
      setAttempts(
        toState(data.org?.attempts_per_scenario, data.platform.attempts_per_scenario || 3)
      );
      setTotal(toState(data.org?.total_interviews, data.platform.total_interviews || 15));
      setCooldown(toState(data.org?.cooldown_days, data.platform.cooldown_days || 7));
    }
  };

  useEffect(() => {
    (isPlatform ? api.platformLimits() : api.orgLimits())
      .then(apply)
      .catch((err) => setError(err.message));
    // `scope` never changes for a mounted page — each console renders one.
  }, []);

  const onSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const payload = {
      attempts_per_scenario: toStored(attempts),
      total_interviews: toStored(total),
      cooldown_days: toStored(cooldown),
    };
    try {
      apply(isPlatform ? await api.setPlatformLimits(payload) : await api.setOrgLimits(payload));
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!platform && !error) {
    return (
      <section className="panel">
        <h2>{t.limits.title}</h2>
        <p>{t.common.loading}</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>{t.limits.title}</h2>
      <p className="section-intro">{t.limits.intro}</p>

      <form onSubmit={onSave}>
        <LimitField
          id="limit-attempts"
          label={t.limits.attemptsLabel}
          hint={t.limits.attemptsHint}
          state={attempts}
          onChange={(next) => {
            setSaved(false);
            setAttempts(next);
          }}
          inheritedFrom={isPlatform ? null : platform?.attempts_per_scenario ?? null}
          disabled={busy}
        />
        <LimitField
          id="limit-total"
          label={t.limits.totalLabel}
          hint={t.limits.totalHint}
          state={total}
          onChange={(next) => {
            setSaved(false);
            setTotal(next);
          }}
          inheritedFrom={isPlatform ? null : platform?.total_interviews ?? null}
          disabled={busy}
        />

        <LimitField
          id="limit-cooldown"
          label={t.limits.cooldownLabel}
          hint={t.limits.cooldownHint}
          state={cooldown}
          onChange={(next) => {
            setSaved(false);
            setCooldown(next);
          }}
          inheritedFrom={isPlatform ? null : platform?.cooldown_days ?? null}
          disabled={busy}
          noneLabel={t.limits.noCooldown}
          unit={t.limits.cooldownDays}
        />

        {/* The counting rule, said once where the numbers are chosen. It is the
            part an administrator will get wrong otherwise — three abandoned
            attempts is three attempts used. */}
        <p className="field-hint">{t.limits.startedCounts}</p>

        {/* Below the button, not above it. "Saved." clears again on the next
            change, and while it sat above the button it moved the button by its
            own height — so the click that followed a correction landed on
            nothing. */}
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? t.limits.saving : t.limits.save}
        </button>

        {error && <p className="error">{error}</p>}
        {saved && <p className="success-message">{t.limits.saved}</p>}
      </form>
    </section>
  );
}
