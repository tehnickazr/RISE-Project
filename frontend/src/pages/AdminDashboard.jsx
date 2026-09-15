import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import { useT } from '../i18n/index.js';
import logo from '../assets/images/Logo_Rise.svg';
import UserMenu from '../components/UserMenu.jsx';
import SettingsShell from '../components/SettingsShell.jsx';
import Statistics from '../components/Statistics.jsx';
import { LANGUAGES } from '../lib/orgFields.js';

/**
 * Row status and request status are keys, not sentences.
 *
 * They used to be English strings built into the row object, which meant the
 * data carried the interface's language around with it and could not be
 * translated at the point of display without parsing prose back into meaning.
 */
const ACCOUNT_STATUS = {
  active: (t) => t.admin.statusActive,
  suspended: (t) => t.admin.statusSuspended,
  invited: (t) => t.admin.statusInvited,
  expired: (t) => t.admin.statusExpired,
};

/**
 * What a request *is*, not what you can do to it.
 *
 * These pointed at the button labels, so the status column read "Mark
 * answered" and "Refuse" — and `cancelled` showed `t.admin.cancel`, which is
 * the dismiss button of a modal: in Serbian the status of a cancelled request
 * was the words "Not now". A status is a noun in every language the platform
 * speaks.
 */
const REQUEST_STATUS = {
  pending: (t) => t.admin.statusPending,
  completed: (t) => t.admin.statusAnswered,
  refused: (t) => t.admin.statusRefused,
  cancelled: (t) => t.admin.statusCancelled,
};

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const t = useT();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState(null);
  const [invitations, setInvitations] = useState(null);
  const [error, setError] = useState(null);
  const [inviteError, setInviteError] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState(null);
  const [requests, setRequests] = useState([]);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    display_name: '',
    role: 'student',
    // Replaced by the school's own language as soon as the dialogue opens; this
    // is only what the state holds before anyone has looked at it.
    preferred_language: 'en',
  });

  const loadAdminData = () =>
    Promise.all([api.adminUsers(), api.adminInvitations(), api.adminDataRequests()])
      .then(([userData, invitationData, requestData]) => {
        setUsers(userData.users);
        setInvitations(invitationData.invitations);
        setRequests(requestData.requests);
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    loadAdminData();
  }, []);

  const userRows = useMemo(() => {
    if (!users) return null;

    const userEmails = new Set(users.map((account) => account.email.toLowerCase()));
    const accountRows = users.map((account) => ({
      ...account,
      row_id: `user-${account.id}`,
      kind: 'user',
      status: account.status === 'suspended' ? 'suspended' : 'active',
      // Greyed, never hidden. A suspended account you cannot see is one you
      // cannot bring back, and the administrator looking for it would conclude
      // it had been deleted.
      muted: account.status === 'suspended',
      sort_at: account.created_at,
    }));

    const invitationRows = (invitations ?? [])
      .filter((invitation) => !invitation.accepted_at)
      // Accepted invitations are redacted, so `email` is null on them. The
      // filter above already excludes those; the guard is here so that reordering
      // these two lines cannot turn a privacy measure into a crash.
      .filter((invitation) => !userEmails.has((invitation.email ?? '').toLowerCase()))
      .map((invitation) => {
        const expired = new Date(invitation.expires_at).getTime() <= Date.now();
        return {
          id: invitation.id,
          row_id: `invitation-${invitation.id}`,
          kind: 'invitation',
          email: invitation.email,
          display_name: invitation.display_name,
          role: invitation.role,
          preferred_language: invitation.preferred_language,
          created_at: invitation.created_at,
          expires_at: invitation.expires_at,
          status: expired ? 'expired' : 'invited',
          muted: true,
          sort_at: invitation.created_at,
        };
      });

    return [...accountRows, ...invitationRows].sort(
      (a, b) => new Date(b.sort_at).getTime() - new Date(a.sort_at).getTime()
    );
  }, [users, invitations]);

  const onInviteChange = (field, value) => {
    setInviteForm((current) => ({ ...current, [field]: value }));
  };

  const resetInviteForm = () => {
    setInviteForm({
      email: '',
      display_name: '',
      role: 'student',
      preferred_language: user?.org_default_language || 'en',
    });
  };

  const openInviteModal = () => {
    setInviteError(null);
    setInviteSuccess(null);
    // Default to the school's own language rather than English: the invitation
    // email is sent in whatever this says, and a Serbian school inviting a
    // Serbian teacher in English is a small daily irritation nobody asked for.
    setInviteForm((f) => ({ ...f, preferred_language: user?.org_default_language || f.preferred_language }));
    setInviteModalOpen(true);
  };

  const closeInviteModal = () => {
    if (inviteBusy) return;
    setInviteModalOpen(false);
    setInviteError(null);
    resetInviteForm();
  };

  const onInvite = async (event) => {
    event.preventDefault();
    setInviteBusy(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      await api.inviteUser(inviteForm);
      setInviteSuccess(t.admin.invitationSent(inviteForm.email));
      resetInviteForm();
      setInviteModalOpen(false);
      await loadAdminData();
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviteBusy(false);
    }
  };

  /**
   * Suspend, or bring back.
   *
   * Suspending asks first, because the person is signed out of whatever they
   * were doing the moment it happens. Reactivating does not: it only restores
   * what was already there, and a confirmation for an action that cannot hurt
   * anyone is the kind of prompt people learn to click through.
   */
  const onToggleStatus = async (row) => {
    setOpenMenuId(null);
    setError(null);
    const next = row.status === 'suspended' ? 'active' : 'suspended';
    if (next === 'suspended' && !window.confirm(t.admin.confirmSuspend(row.display_name))) return;
    setDeleteBusyId(row.row_id);
    try {
      await api.setUserStatus(row.id, next);
      await loadAdminData();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteBusyId(null);
    }
  };

  /**
   * Deleting a person is the one irreversible action here, so it asks with real
   * numbers rather than "are you sure?". A dialog that cannot say what it
   * destroys invites a reflexive yes.
   */
  const onAskDelete = async (row) => {
    setOpenMenuId(null);
    if (row.kind !== 'user') {
      if (!window.confirm(t.admin.confirmCancelInvitation)) return;
      setDeleteBusyId(row.row_id);
      try {
        await api.deleteInvitation(row.id);
        await loadAdminData();
      } catch (err) {
        setError(err.message);
      } finally {
        setDeleteBusyId(null);
      }
      return;
    }
    try {
      const impact = await api.userImpact(row.id);
      setConfirming({ row, impact });
    } catch (err) {
      setError(err.message);
    }
  };

  const onConfirmDelete = async () => {
    const row = confirming.row;
    setDeleteBusyId(row.row_id);
    setError(null);
    try {
      await api.deleteUser(row.id);
      setConfirming(null);
      await loadAdminData();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteBusyId(null);
    }
  };

  const onResolve = async (request, status) => {
    const note =
      status === 'refused'
        ? window.prompt(t.admin.refuseReason)
        : '';
    if (status === 'refused' && !note) return;
    try {
      await api.resolveDataRequest(request.id, status, note);
      await loadAdminData();
    } catch (err) {
      setError(err.message);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === 'pending');

  return (
    <main>
      <header className="page-header">
        <img className="brand-logo" src={logo} alt="RISE" />
        <UserMenu user={user} logout={logout} label={t.common.signOut} accountLabel={t.account.menuLink} />
      </header>

      <div className="tabs" role="tablist" aria-label={t.admin.sections}>
        <button
          className={activeTab === 'users' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={activeTab === 'users'}
          onClick={() => setActiveTab('users')}
        >
          {t.admin.tabUsers}
        </button>
        <button
          className={activeTab === 'statistics' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={activeTab === 'statistics'}
          onClick={() => setActiveTab('statistics')}
        >
          {t.admin.tabStatistics}
        </button>
        <button
          className={activeTab === 'settings' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={activeTab === 'settings'}
          onClick={() => setActiveTab('settings')}
        >
          {t.admin.tabSettings}
        </button>
      </div>

      {activeTab === 'users' && (
        <section className="admin-panel">
          {error && <p className="error">{error}</p>}
          <div className="admin-toolbar">
            <button className="button primary" type="button" onClick={openInviteModal}>
              {t.admin.inviteUser}
            </button>
          </div>

          {inviteSuccess && <p className="success-message">{inviteSuccess}</p>}

          {/* Deletions only. A copy of your own data is no longer a request —
              you download it yourself — so the one thing left here is the one
              thing an administrator actually has to carry out.

              The queue exists because an email is a notification, not a record:
              Article 12(3) starts a one-month clock, and an inbox has no due
              date and no evidence. See migrations/0011_data_requests.sql. */}
          {requests.length > 0 && (
            <section className="panel data-requests">
              <h2>
                {t.admin.deletionRequests}
                {pendingRequests.length > 0 && (
                  <span className="pill-pending">{t.admin.pending(pendingRequests.length)}</span>
                )}
              </h2>
              <table className="sessions-table">
                <thead>
                  <tr>
                    <th>{t.admin.requested}</th>
                    <th>{t.admin.person}</th>
                    <th>{t.admin.replyDue}</th>
                    <th>{t.admin.status}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className={r.status === 'pending' ? undefined : 'muted-row'}>
                      <td data-label={t.admin.requested}>{formatDate(r.requested_at)}</td>
                      <td data-label={t.admin.person}>
                        {r.display_name}
                        <span className="row-sub">{r.email}</span>
                      </td>
                      <td data-label={t.admin.replyDue}>{formatDate(r.due_at)}</td>
                      <td data-label={t.admin.status}>
                        {r.status === 'pending' ? (
                          <span className="pill-pending">{t.admin.statusPending}</span>
                        ) : (
                          <span className="role-pill">{REQUEST_STATUS[r.status]?.(t) ?? r.status}</span>
                        )}
                        {r.note && <span className="row-sub">{r.note}</span>}
                      </td>
                      <td className="table-action">
                        {r.status === 'pending' && (
                          <div className="request-actions">
                            <button
                              type="button"
                              className="button secondary"
                              onClick={() => onResolve(r, 'completed')}
                            >
                              {t.admin.markAnswered}
                            </button>
                            <button
                              type="button"
                              className="button ghost danger"
                              onClick={() => onResolve(r, 'refused')}
                            >
                              {t.admin.refuse}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {!userRows && !error && <p>{t.common.loading}</p>}
          {userRows && (
            <>
              <h2>{t.admin.users}</h2>
              <table className="sessions-table admin-users-table">
                <thead>
                  <tr>
                    <th>{t.admin.name}</th>
                    <th>{t.admin.email}</th>
                    <th>{t.admin.role}</th>
                    <th>{t.admin.language}</th>
                    <th>{t.admin.status}</th>
                    <th>{t.admin.created}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {userRows.map((account) => (
                    <tr
                      key={account.row_id}
                      className={account.muted ? 'muted-row' : undefined}
                    >
                      <td data-label={t.admin.name}>{account.display_name}</td>
                      <td data-label={t.admin.email}>{account.email}</td>
                      <td data-label={t.admin.role}>
                        <span className="role-pill">{t.admin[`role${account.role[0].toUpperCase()}${account.role.slice(1)}`] ?? account.role}</span>
                      </td>
                      <td data-label={t.admin.language}>
                        {account.preferred_language || '—'}
                      </td>
                      <td data-label={t.admin.status}>{ACCOUNT_STATUS[account.status]?.(t) ?? account.status}</td>
                      <td data-label={t.admin.created}>{formatDate(account.created_at)}</td>
                      <td className="table-action admin-menu-cell">
                        <button
                          type="button"
                          className="dots-button"
                          aria-label={t.admin.moreActions}
                          aria-haspopup="menu"
                          aria-expanded={openMenuId === account.row_id}
                          disabled={
                            deleteBusyId === account.row_id ||
                            (account.kind === 'user' && account.id === user.id)
                          }
                          onClick={() =>
                            setOpenMenuId((id) => (id === account.row_id ? null : account.row_id))
                          }
                        >
                          ⋯
                        </button>
                        {openMenuId === account.row_id && (
                          <div className="row-menu" role="menu">
                            {/* Suspension sits above deletion and is not styled
                                as danger: it is the reversible one, and it
                                should be the easier of the two to reach for. */}
                            {account.kind === 'user' && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => onToggleStatus(account)}
                              >
                                {account.status === 'suspended'
                                  ? t.admin.reactivateAccount
                                  : t.admin.suspendAccount}
                              </button>
                            )}
                            <button
                              type="button"
                              role="menuitem"
                              className="danger"
                              onClick={() => onAskDelete(account)}
                            >
                              {account.kind === 'user'
                                ? t.admin.deleteAccount
                                : t.admin.cancelInvitation}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {activeTab === 'statistics' && (
        <section className="admin-panel">
          {/* Scoped to this school by the server, from the actor. There is no
              parameter here that could widen it. */}
          <Statistics scope="organization" />
        </section>
      )}

      {activeTab === 'settings' && (
        <section className="admin-panel">
          <SettingsShell />
        </section>
      )}

      {inviteModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeInviteModal}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-user-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="invite-user-title">{t.admin.inviteUser}</h2>
              <button
                className="button ghost"
                type="button"
                onClick={closeInviteModal}
                disabled={inviteBusy}
                aria-label={t.admin.close}
              >
                {t.admin.close}
              </button>
            </div>

            <form className="invite-form modal-invite-form" onSubmit={onInvite}>
              <label>
                {t.admin.name}
                <input
                  value={inviteForm.display_name}
                  onChange={(e) => onInviteChange('display_name', e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label>
                {t.admin.email}
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => onInviteChange('email', e.target.value)}
                  required
                />
              </label>
              <label>
                {t.admin.role}
                <select
                  value={inviteForm.role}
                  onChange={(e) => onInviteChange('role', e.target.value)}
                >
                  <option value="student">{t.admin.roleStudent}</option>
                  <option value="teacher">{t.admin.roleTeacher}</option>
                  <option value="admin">{t.admin.roleAdmin}</option>
                </select>
              </label>
              <label>
                {t.admin.language}
                <select
                  value={inviteForm.preferred_language}
                  onChange={(e) => onInviteChange('preferred_language', e.target.value)}
                >
                  {/* Each language in its own name, never translated: a
                      Portuguese speaker should recognise "Português" whatever
                      the interface language happens to be. */}
                  {LANGUAGES.map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </label>
              {inviteError && <p className="error">{inviteError}</p>}
              <div className="modal-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={closeInviteModal}
                  disabled={inviteBusy}
                >
                  {t.admin.cancel}
                </button>
                <button className="button primary" type="submit" disabled={inviteBusy}>
                  {inviteBusy ? t.admin.sending : t.admin.sendInvitation}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {confirming && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card delete-confirm">
            <h3>{t.admin.deleteTitle(confirming.impact.display_name)}</h3>
            <p className="section-intro">
              This cannot be undone. Export their data first if they asked for a copy as well.
            </p>
            <div className="will-delete">
              <b>{t.admin.deleteIntro}</b>
              <ul>
                <li>
                  the account <code>{confirming.impact.email}</code>
                </li>
                <li>{t.admin.deleteSessions(confirming.impact.sessions)}</li>
                <li>
                  {t.admin.deleteAnswers(confirming.impact.answers)}
                </li>
                <li>{t.admin.deleteSummaries(confirming.impact.summaries)}</li>
              </ul>
            </div>
            <p className="field-hint">{t.admin.deleteAuditNote}</p>
            <div className="account-actions">
              <button type="button" className="button secondary" onClick={() => setConfirming(null)}>
                {t.admin.keep}
              </button>
              <button
                type="button"
                className="button danger-solid"
                onClick={onConfirmDelete}
                disabled={deleteBusyId !== null}
              >
                {deleteBusyId !== null ? t.admin.deleting : t.admin.confirmDelete}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
