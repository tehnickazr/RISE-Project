async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error ?? `HTTP ${res.status}`);
    err.status = res.status;
    // Routes that have a translated equivalent answer with a stable code as
    // well as the English sentence.
    err.code = data?.code ?? null;
    // Some failures carry a next step as well as a reason — a sheet that cannot
    // be read is usually one that has not been shared yet.
    err.hint = data?.hint ?? null;
    // And a dead invitation carries the language it was written in, so the
    // explanation can be given in the language the person was invited in
    // rather than in the language this file happens to be written in.
    err.language = data?.language ?? null;
    // A scenario refused for its cooldown carries the date it comes back. An
    // absolute instant, formatted in the reader's locale at the point of
    // display — never a number of days computed on the server.
    err.availableAt = data?.available_at ?? null;
    throw err;
  }
  return data;
}

export const api = {
  login: (email, password) =>
    request('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request('/api/logout', { method: 'POST' }),
  // Always resolves, whatever the address — see the endpoint. The page must
  // not branch on the answer, because there is nothing to branch on.
  forgotPassword: (email) =>
    request('/api/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  checkResetToken: (token) => request(`/api/reset-password/${encodeURIComponent(token)}`),
  resetPassword: (token, password) =>
    request('/api/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  me: () => request('/api/me'),
  setLanguage: (language) =>
    request('/api/me/language', {
      method: 'POST',
      body: JSON.stringify({ language }),
    }),
  updateMe: (payload) => request('/api/me', { method: 'PATCH', body: JSON.stringify(payload) }),
  changePassword: (currentPassword, newPassword) =>
    request('/api/me/password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  acknowledgeNotice: (version, language) =>
    request('/api/me/notice', { method: 'POST', body: JSON.stringify({ version, language }) }),
  // A plain URL, not a fetch: the response carries Content-Disposition, so
  // navigating to it lets the browser save the file. Fetching it would put a
  // person's whole transcript in memory only to hand it straight back out.
  myExportUrl: () => '/api/me/export',
  myDataRequests: () => request('/api/me/data-requests'),
  createDataRequest: (kind) =>
    request('/api/me/data-requests', { method: 'POST', body: JSON.stringify({ kind }) }),
  cancelDataRequest: (id) =>
    request(`/api/me/data-requests/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminDataRequests: () => request('/api/admin/data-requests'),
  resolveDataRequest: (id, status, note) =>
    request(`/api/admin/data-requests/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
    }),
  userImpact: (id) => request(`/api/admin/users/${encodeURIComponent(id)}/impact`),
  scenarios: () => request('/api/scenarios'),
  scenario: (id) => request(`/api/scenarios/${encodeURIComponent(id)}`),
  sessions: () => request('/api/sessions'),
  session: (id) => request(`/api/sessions/${encodeURIComponent(id)}`),
  studentProgress: (id) => request(`/api/students/${encodeURIComponent(id)}/progress`),
  adminUsers: () => request('/api/admin/users'),
  contentSource: () => request('/api/admin/content-source'),
  setContentSource: (spreadsheetId) =>
    request('/api/admin/content-source', {
      method: 'PUT',
      body: JSON.stringify({ spreadsheet_id: spreadsheetId }),
    }),
  syncContent: (note) =>
    request('/api/admin/content-source/sync', { method: 'POST', body: JSON.stringify({ note }) }),
  contentVersions: () => request('/api/admin/content-versions'),
  revertContentVersion: (id) =>
    request(`/api/admin/content-versions/${encodeURIComponent(id)}/revert`, { method: 'POST' }),
  adminGroups: () => request('/api/admin/groups'),
  createGroup: (name) =>
    request('/api/admin/groups', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteGroup: (id) =>
    request(`/api/admin/groups/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  setGroupMember: (groupId, userId, remove = false) =>
    request(`/api/admin/groups/${encodeURIComponent(groupId)}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, remove }),
    }),
  platformOrganizations: () => request('/api/platform/organizations'),
  createOrganization: (payload) =>
    request('/api/platform/organizations', { method: 'POST', body: JSON.stringify(payload) }),
  setOrganizationStatus: (id, status) =>
    request(`/api/platform/organizations/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  platformInvite: (payload) =>
    request('/api/platform/invitations', { method: 'POST', body: JSON.stringify(payload) }),
  deleteUser: (id) =>
    request(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  setUserStatus: (id, status) =>
    request(`/api/admin/users/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  // Effective limits plus the two sources they resolve from, so the settings
  // page can say whether a number is this school's or the platform's.
  orgLimits: () => request('/api/admin/limits'),
  setOrgLimits: (payload) =>
    request('/api/admin/limits', { method: 'PUT', body: JSON.stringify(payload) }),
  platformLimits: () => request('/api/platform/limits'),
  setPlatformLimits: (payload) =>
    request('/api/platform/limits', { method: 'PUT', body: JSON.stringify(payload) }),
  // The school's own paragraphs of the privacy notice, with the gaps alongside.
  privacySettings: () => request('/api/admin/privacy-settings'),
  setPrivacySettings: (payload) =>
    request('/api/admin/privacy-settings', { method: 'PUT', body: JSON.stringify(payload) }),
  supportSettings: () => request('/api/admin/support-settings'),
  setSupportSettings: (payload) =>
    request('/api/admin/support-settings', { method: 'PUT', body: JSON.stringify(payload) }),
  platformSupport: () => request('/api/platform/support'),
  setPlatformSupport: (payload) =>
    request('/api/platform/support', { method: 'PUT', body: JSON.stringify(payload) }),
  // What the notice page needs to render its school-specific sentences.
  noticeSettings: () => request('/api/me/notice-settings'),
  adminInvitations: () => request('/api/admin/invitations'),
  deleteInvitation: (id) =>
    request(`/api/admin/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  inviteUser: (payload) =>
    request('/api/admin/invitations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  // A teacher's invitation carries no role. The endpoint does not accept one —
  // see backend/src/routes/teacher.js — and sending one from here would only
  // suggest, wrongly, that the interface is what restricts this to students.
  inviteStudent: (payload) =>
    request('/api/teacher/invitations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  invitation: (token) => request(`/api/invitations/${encodeURIComponent(token)}`),
  acceptInvitation: (token, password, notice) =>
    request(`/api/invitations/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      body: JSON.stringify({ password, ...notice }),
    }),
  startSession: (scenario_id, language) =>
    request('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(language ? { scenario_id, language } : { scenario_id }),
    }),
  submitAnswer: (sessionId, question_id, answer, dictated = false) =>
    request(`/api/sessions/${encodeURIComponent(sessionId)}/answers`, {
      method: 'POST',
      body: JSON.stringify({ question_id, answer, dictated }),
    }),
  // Sends the recording as a raw body rather than multipart: there is exactly
  // one part, and the Content-Type the recorder produced is the only metadata
  // the server needs. `request()` is bypassed because it forces JSON headers.
  transcribe: async (sessionId, blob) => {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/transcribe`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': blob.type || 'audio/webm' },
      body: blob,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(data?.error ?? `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  },
};
