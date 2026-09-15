import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import { useT } from '../i18n/index.js';
import logo from '../assets/images/Logo_Rise.svg';
import UserMenu from '../components/UserMenu.jsx';
import { COUNTRIES, LANGUAGES, countryName, slugify } from '../lib/orgFields.js';
import SessionLimitsSettings from '../components/SessionLimitsSettings.jsx';
import Statistics from '../components/Statistics.jsx';

/**
 * The platform console.
 *
 * Counts, never content. There is no route from this page to a student's
 * answers, and there is no endpoint behind it that would return any — that is
 * the claim the DPIA and the transfer assessment rest on, and it holds only
 * while both remain true.
 */
export default function PlatformDashboard() {
  const { user, logout } = useAuth();
  const t = useT();
  const [orgs, setOrgs] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('orgs');
  const [orgForm, setOrgForm] = useState({ name: '', slug: '', country: 'RS', default_language: 'sr' });
  // The slug follows the name until it is edited by hand, then it stops --
  // otherwise typing a deliberate slug and then correcting a typo in the name
  // silently throws the deliberate one away.
  const [slugTouched, setSlugTouched] = useState(false);
  const [inviteFor, setInviteFor] = useState(null);
  const [inviteForm, setInviteForm] = useState({ email: '', display_name: '', preferred_language: 'en' });
  const [message, setMessage] = useState(null);
  const [supportForm, setSupportForm] = useState({ support_name: '', support_email: '' });
  const [supportSaved, setSupportSaved] = useState(false);

  /**
   * Open the invite dialogue, defaulting the language to the organisation's
   * own. An administrator at a Serbian school is almost never being invited in
   * English, and the invitation email is sent in whatever this says.
   */
  const openInvite = (target) => {
    setError(null);
    setMessage(null);
    setInviteForm({
      email: '',
      display_name: '',
      preferred_language: target === 'super' ? 'en' : (target.default_language || 'en'),
    });
    setInviteFor(target);
  };

  const load = () =>
    api.platformOrganizations()
      .then((d) => setOrgs(d.organizations))
      .catch((err) => setError(err.message));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    api.platformSupport()
      .then((d) =>
        setSupportForm({
          support_name: d.platform?.support_name ?? '',
          support_email: d.platform?.support_email ?? '',
        })
      )
      .catch(() => {});
  }, []);

  const onSaveSupport = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null); setSupportSaved(false);
    const blank = (v) => (v.trim() === '' ? null : v.trim());
    try {
      const d = await api.setPlatformSupport({
        support_name: blank(supportForm.support_name),
        support_email: blank(supportForm.support_email),
      });
      setSupportForm({
        support_name: d.platform?.support_name ?? '',
        support_email: d.platform?.support_email ?? '',
      });
      setSupportSaved(true);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const onCreateOrg = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    try {
      await api.createOrganization({
        name: orgForm.name.trim(),
        slug: orgForm.slug.trim(),
        country: orgForm.country.trim() || undefined,
        default_language: orgForm.default_language,
      });
      setOrgForm({ name: '', slug: '', country: 'RS', default_language: 'sr' });
      setSlugTouched(false);
      setMessage('Organisation created.');
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const onStatus = async (org, status) => {
    if (status === 'suspended' &&
        !window.confirm(`Suspend ${org.name}? Every member is signed out and cannot sign in. No data is touched.`)) {
      return;
    }
    setError(null);
    try { await api.setOrganizationStatus(org.id, status); await load(); }
    catch (err) { setError(err.message); }
  };

  const onInvite = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    try {
      await api.platformInvite({
        email: inviteForm.email.trim(),
        display_name: inviteForm.display_name.trim(),
        preferred_language: inviteForm.preferred_language,
        role: inviteFor === 'super' ? 'super_admin' : 'admin',
        org_id: inviteFor === 'super' ? undefined : inviteFor.id,
      });
      setMessage(`Invitation sent to ${inviteForm.email}.`);
      setInviteFor(null);
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <main>
      <header className="page-header">
        <img className="brand-logo" src={logo} alt="RISE" />
        <UserMenu user={user} logout={logout} label={t.common.signOut} accountLabel={t.account.menuLink} />
      </header>

      {/* Three sections rather than one long scroll. The console had grown to
          five panels of unrelated things: a table you read, a form you fill in
          once, and settings you touch twice a year. */}
      <nav className="tabs" aria-label="Sections">
        {[
          ['orgs', 'Organisations'],
          ['settings', 'Settings'],
          ['stats', 'Statistics'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'active' : ''}
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>



      {error && <p className="error">{error}</p>}
      {message && <p className="success-message">{message}</p>}
      {!orgs && !error && <p>{t.common.loading}</p>}


      {tab === 'orgs' && (
        <>
        <h1>Organisations</h1>
        <p className="page-intro">
          Every school on the platform. This console shows how many people are in each organisation
          and how it is configured — never what anyone wrote.
        </p>
        {orgs && (
          <section className="panel">
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>Organisation</th>
                  <th>Country</th>
                  <th>Admins</th>
                  <th>Teachers</th>
                  <th>Students</th>
                  <th>Groups</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} className={o.status === 'active' ? undefined : 'muted-row'}>
                    <td data-label="Organisation">
                      {o.name}
                      <span className="row-sub">{o.slug}</span>
                    </td>
                    <td data-label="Country">{countryName(o.country)}</td>
                    {/* An organisation with no administrator can invite nobody
                        and answer no erasure request. Flagged rather than left
                        to be noticed. */}
                    <td data-label="Admins">
                      {o.admins === 0 ? <span className="pill-pending">none</span> : o.admins}
                    </td>
                    <td data-label="Teachers">{o.teachers}</td>
                    <td data-label="Students">{o.students}</td>
                    <td data-label="Groups">{o.groups}</td>
                    <td data-label="Status">
                      <span className={o.status === 'active' ? 'role-pill' : 'pill-pending'}>{o.status}</span>
                    </td>
                    <td className="table-action">
                      <div className="request-actions">
                        <button type="button" className="button secondary" onClick={() => openInvite(o)}>
                          Invite admin
                        </button>
                        {o.status === 'active' ? (
                          <button type="button" className="button ghost danger" onClick={() => onStatus(o, 'suspended')}>
                            Suspend
                          </button>
                        ) : (
                          <button type="button" className="button ghost" onClick={() => onStatus(o, 'active')}>
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="panel">
          <h2>New organisation</h2>
          <form className="invite-form" onSubmit={onCreateOrg}>
            <label>
              Name
              <input
                value={orgForm.name}
                required
                minLength={2}
                placeholder="Tehnička škola Zrenjanin"
                onChange={(e) => {
                  const name = e.target.value;
                  setOrgForm((f) => ({
                    ...f,
                    name,
                    slug: slugTouched ? f.slug : slugify(name),
                  }));
                }}
              />
            </label>
            <label>
              Short name (slug)
              <input
                value={orgForm.slug}
                required
                pattern="[a-z0-9-]{2,60}"
                placeholder="lowercase-with-hyphens"
                onChange={(e) => {
                  setSlugTouched(true);
                  setOrgForm((f) => ({ ...f, slug: e.target.value }));
                }}
              />
            </label>
            <label>
              Country
              <select
                value={orgForm.country}
                onChange={(e) => setOrgForm((f) => ({ ...f, country: e.target.value }))}
              >
                {COUNTRIES.map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Default language
              <select
                value={orgForm.default_language}
                onChange={(e) => setOrgForm((f) => ({ ...f, default_language: e.target.value }))}
              >
                {LANGUAGES.map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
            </label>
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? 'Working…' : 'Create'}
            </button>
          </form>
          {/* The default language is what an invitation from this organisation
              arrives in, so it is a choice about the people rather than about
              the record. */}
          <p className="field-hint">
            The short name appears in links and is suggested from the name — edit it if the school
            goes by something shorter. The default language is the one invitations are sent in.
          </p>
        </section>
        </>
      )}

      {tab === 'settings' && (
        <>
        <h1>Settings</h1>
        <p className="page-intro">
          Platform-wide defaults and the people who administer them. A school can tighten any limit
          for its own students; none of them can loosen it.
        </p>
        {/* The numbers every school starts from. A school that sets its own keeps
            it; changing this reaches every school that has not. */}
        <SessionLimitsSettings scope="platform" />

        {/* One address, answered by one team, shown inside every school. A school
            cannot edit it, for the same reason it cannot edit the limits above:
            changing it would change who answers for everybody else's students. */}
        <section className="panel">
          <h2>Platform support contact</h2>
          <p className="section-intro">
            Shown to every student and teacher, on every school's help sheet, for faults in the
            platform itself. Leave it blank and students see only their own school's contact.
          </p>
          <form className="settings-form" onSubmit={onSaveSupport}>
            <label>
              <span>Name</span>
              <input
                value={supportForm.support_name}
                placeholder="RISE platform support"
                onChange={(e) => setSupportForm((f) => ({ ...f, support_name: e.target.value }))}
              />
            </label>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={supportForm.support_email}
                placeholder="support@example.org"
                onChange={(e) => setSupportForm((f) => ({ ...f, support_email: e.target.value }))}
              />
              <span className="sub">
                This has to be a mailbox that receives. Students write to it.
              </span>
            </label>
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            {supportSaved && <p className="success-message">Saved.</p>}
          </form>
        </section>

        <section className="panel">
          <h2>Platform administrators</h2>
          <p className="panel-hint">
            A super administrator provisions organisations and invites their first administrator.
            They belong to no organisation and cannot read student data.
          </p>
          <button type="button" className="button secondary" onClick={() => openInvite('super')}>
            Invite a super administrator
          </button>
        </section>
        </>
      )}

      {tab === 'stats' && (
        <>
        <h1>Statistics</h1>
        <p className="page-intro">
          Everything the platform can count, across every school. Aggregates only: there is no
          endpoint here that would return one student's work, and none should be added.
        </p>
        <Statistics scope="platform" />
        </>
      )}


      {inviteFor && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => !busy && setInviteFor(null)}
        >
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="platform-invite-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="platform-invite-title">
                {inviteFor === 'super'
                  ? 'Invite a super administrator'
                  : `Invite an administrator for ${inviteFor.name}`}
              </h2>
              <button
                className="button ghost"
                type="button"
                onClick={() => setInviteFor(null)}
                disabled={busy}
                aria-label="Close"
              >
                Close
              </button>
            </div>

            <form className="invite-form modal-invite-form" onSubmit={onInvite}>
              <label>
                Name
                <input
                  value={inviteForm.display_name}
                  required
                  autoFocus
                  onChange={(e) => setInviteForm((f) => ({ ...f, display_name: e.target.value }))}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={inviteForm.email}
                  required
                  onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
              <label>
                Language
                <select
                  value={inviteForm.preferred_language}
                  onChange={(e) =>
                    setInviteForm((f) => ({ ...f, preferred_language: e.target.value }))
                  }
                >
                  {LANGUAGES.map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </label>
              {error && <p className="error">{error}</p>}
              <div className="modal-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setInviteFor(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button className="button primary" type="submit" disabled={busy}>
                  {busy ? 'Sending…' : 'Send invitation'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

    </main>
  );
}
