import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useT } from '../i18n/index.js';

function formatDate(ts) {
  return ts ? new Date(ts).toLocaleString() : '';
}

/**
 * Where this school's interviews come from.
 *
 * No credential field, deliberately. Access is granted the way Google grants
 * it — by sharing the sheet with the platform's service account — so what an
 * administrator needs is that address to paste into Google's own share dialog,
 * not somewhere to type a key. Asking for a key would mean holding somebody's
 * Google credentials to solve a problem sharing already solves.
 */
export default function ContentSourceSettings() {
  const t = useT();
  const [state, setState] = useState(null);
  const [serviceAccount, setServiceAccount] = useState(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [hint, setHint] = useState(null);
  const [message, setMessage] = useState(null);
  const [versions, setVersions] = useState([]);
  const [lastSync, setLastSync] = useState(null);

  const load = () =>
    Promise.all([api.contentSource(), api.contentVersions()])
      .then(([d, v]) => {
        setState(d.content_source);
        setServiceAccount(d.service_account);
        setValue(d.content_source?.spreadsheet_id ?? '');
        setVersions(v.versions);
      })
      .catch((err) => setError(err.message));

  useEffect(() => { load(); }, []);

  const onSave = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null); setHint(null); setMessage(null);
    try {
      const d = await api.setContentSource(value.trim());
      setState(d.content_source);
      setMessage(`${t.contentSettings.connected} — ${d.content_source.last_check_message}.`);
    } catch (err) {
      setError(err.message);
      setHint(err.hint ?? null);
    } finally { setBusy(false); }
  };

  const onSync = async () => {
    setBusy(true); setError(null); setHint(null); setMessage(null); setLastSync(null);
    try {
      setLastSync(await api.syncContent(null));
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const onRevert = async (v) => {
    if (!window.confirm(
      t.contentSettings.confirmRevert
    )) return;
    setBusy(true); setError(null); setMessage(null); setLastSync(null);
    try {
      await api.revertContentVersion(v.id);
      setMessage(t.contentSettings.reverted);
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <section className="panel">
      <h2>{t.contentSettings.title}</h2>
      <p className="section-intro">
        {t.contentSettings.intro}
      </p>

      {serviceAccount && (
        <p className="field-hint">
          {t.contentSettings.shareHint(serviceAccount)}
        </p>
      )}

      <form onSubmit={onSave} className="invite-form">
        <label>
          {t.contentSettings.linkLabel}
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            required
          />
        </label>
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? t.contentSettings.checking : t.contentSettings.saveAndTest}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {hint && <p className="field-hint">{hint}</p>}
      {message && <p className="success-message">{message}</p>}

      {/* The last check is shown because the failure this guards against is
          silent: a sheet that stops being shared keeps working until the cache
          lapses, and then the catalogue is simply empty. */}
      {state && (
        <div className="student-tags content-meta">
          {state.last_check_ok === true && <span className="role-pill">{t.contentSettings.connected}</span>}
          {state.last_check_ok === false && <span className="pill-pending">{t.contentSettings.notReachable}</span>}
          {state.last_check_message && (
            <span className="tag muted">{state.last_check_message}</span>
          )}
          {state.last_checked_at && (
            <span className="tag muted">{t.contentSettings.checkedAt(formatDate(state.last_checked_at))}</span>
          )}
          {state.updated_by_name && (
            <span className="tag muted">{t.contentSettings.setBy(state.updated_by_name)}</span>
          )}
        </div>
      )}

      {state?.spreadsheet_id && (
        <p className="account-actions">
          <button type="button" className="button primary" onClick={onSync} disabled={busy}>
            {busy ? t.contentSettings.importing : t.contentSettings.importNow}
          </button>
          <a
            className="button ghost"
            href={`https://docs.google.com/spreadsheets/d/${state.spreadsheet_id}/edit`}
            target="_blank"
            rel="noreferrer"
          >
            {t.contentSettings.openSheet}
          </a>
        </p>
      )}

      {/* Students read the database, never the spreadsheet. Editing the sheet
          changes nothing until someone imports it — which is the point: it is
          also what stops an accidental edit reaching a class mid-lesson. */}
      <p className="field-hint">
        {t.contentSettings.editHint}
      </p>

      {lastSync && (
        <div className="note">
          <span className="note-label">{t.contentSettings.imported}</span>
          <p>
            {t.contentSettings.importedCounts(
              lastSync.counts.scenarios, lastSync.counts.questions, lastSync.counts.rubrics
            )}{' '}
            {lastSync.diff.scenarios.added > 0 && `${t.contentSettings.added(lastSync.diff.scenarios.added)} `}
            {lastSync.diff.scenarios.changed > 0 && `${t.contentSettings.changed(lastSync.diff.scenarios.changed)} `}
            {lastSync.diff.scenarios.removed > 0 && `${t.contentSettings.removed(lastSync.diff.scenarios.removed)} `}
            {lastSync.diff.scenarios.added === 0
              && lastSync.diff.scenarios.changed === 0
              && lastSync.diff.scenarios.removed === 0
              && t.contentSettings.noChange}
          </p>
          {/* Removal is the one change worth naming rather than counting: it is
              the only one that takes something away from students. */}
          {lastSync.diff.removed_scenario_ids.length > 0 && (
            <p className="field-hint">
              {t.contentSettings.noLongerAvailable}{' '}
              {lastSync.diff.removed_scenario_ids.slice(0, 6).join(', ')}
              {lastSync.diff.removed_scenario_ids.length > 6
                && t.contentSettings.andMore(lastSync.diff.removed_scenario_ids.length - 6)}
              . {t.contentSettings.pastUnaffected}
            </p>
          )}
        </div>
      )}

      {versions.length > 0 && (
        <>
          <h3>{t.contentSettings.history}</h3>
          <table className="sessions-table">
            <thead>
              <tr>
                <th>{t.contentSettings.hImported}</th>
                <th>{t.contentSettings.hScenarios}</th>
                <th>{t.contentSettings.hQuestions}</th>
                <th>{t.contentSettings.hBy}</th>
                <th>{t.contentSettings.hInterviews}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className={v.is_current ? undefined : 'muted-row'}>
                  <td data-label={t.contentSettings.hImported}>
                    {formatDate(v.imported_at)}
                    {v.is_current && <span className="role-pill">{t.contentSettings.inUse}</span>}
                  </td>
                  <td data-label={t.contentSettings.hScenarios}>{v.scenario_count}</td>
                  <td data-label={t.contentSettings.hQuestions}>{v.question_count}</td>
                  <td data-label={t.contentSettings.hBy}>{v.imported_by_name ?? '—'}</td>
                  {/* Why an old import cannot simply be tidied away. */}
                  <td data-label={t.contentSettings.hInterviews}>{v.sessions}</td>
                  <td className="table-action">
                    {!v.is_current && (
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => onRevert(v)}
                        disabled={busy}
                      >
                        {t.contentSettings.putBack}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

    </section>
  );
}
