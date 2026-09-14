import express from 'express';
import { z } from 'zod';
import { requireRole, withActor } from '../auth/middleware.js';
import { pool } from '../db/pool.js';
import { issueInvitation } from '../invitations/issue.js';
import { isSupportedLanguage, supportedLanguageMessage } from '../i18n/languages.js';
import { recordRead } from '../db/audit.js';
import { loadSheetContent } from '../sheets/loader.js';
import { syncFromSheet, revertToVersion } from '../content/sync.js';
import { listVersions } from '../content/store.js';
import { forgetContentSource } from '../db/content-source.js';
import { effectiveLimits } from '../db/limits.js';
import { OrgLimitsSchema } from '../sessions/limits.js';
import { schoolSettings, saveSchoolSettings } from '../db/school-settings.js';
import { PrivacySettingsSchema, SupportSettingsSchema } from '../settings/school.js';

export const adminRouter = express.Router();

// Every route below is scoped to the administrator's own organization. A
// school administrator manages their own school and nothing else; the platform
// role lives on /api/platform.
adminRouter.use(requireRole('admin'), withActor);

const InviteSchema = z.object({
  email: z.string().trim().email(),
  display_name: z.string().trim().min(1).max(120),
  role: z.enum(['student', 'teacher', 'admin']),
  // No default here on purpose. An absent language means "the school's own",
  // which this schema cannot know — filling in 'en' would hard-code the wrong
  // answer for every partner and look like a considered choice.
  preferred_language: z.string().trim().optional(),
});

adminRouter.get('/users', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, email, display_name, role, preferred_language, status, created_at
     FROM users
     WHERE org_id = $1
     ORDER BY created_at DESC, email ASC`,
    [req.actor.org_id]
  );
  res.json({ users: rows });
});

/**
 * What deleting this person would destroy.
 *
 * The confirmation dialog needs real numbers. "Delete this user?" invites a
 * reflexive yes; "this removes 4 interviews and 38 answers" does not, and this
 * is the one irreversible action in the platform.
 */
adminRouter.get('/users/:id/impact', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.display_name, u.email, u.role,
            (SELECT count(*)::int FROM interview_sessions s WHERE s.student_id = u.id) AS sessions,
            (SELECT count(*)::int FROM answer_feedback f
               JOIN interview_sessions s ON s.id = f.session_id
              WHERE s.student_id = u.id) AS answers,
            (SELECT count(*)::int FROM interview_messages m
               JOIN interview_sessions s ON s.id = m.session_id
              WHERE s.student_id = u.id AND m.message_type = 'summary') AS summaries
       FROM users u WHERE u.id = $1 AND u.org_id = $2`,
    [req.params.id, req.actor.org_id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

/**
 * Suspend an account, or bring it back.
 *
 * The middle option between leaving a departed student able to sign in and
 * deleting everything they did. Reversible by design, and it destroys nothing —
 * the transcripts, scores and cohort membership all stay exactly where they
 * are. Erasure is the route below, and it remains the only one that removes.
 *
 * Suspending also ends the sessions that are already open. Without that, the
 * person carries on until their cookie happens to expire, which can be days —
 * so the administrator would have performed the action and watched nothing
 * happen. `->>` and not `->` because connect-pg-simple stores `sess` as `json`,
 * which has no equality operator against `jsonb`.
 */
adminRouter.post('/users/:id/status', async (req, res) => {
  const status = req.body?.status;
  if (status !== 'active' && status !== 'suspended') {
    return res.status(400).json({ error: 'status must be active or suspended' });
  }
  if (req.params.id === req.session.userId) {
    return res.status(400).json({ error: 'You cannot suspend your own account' });
  }

  const { rows: before } = await pool.query(
    'SELECT id, display_name, email, role, status FROM users WHERE id = $1 AND org_id = $2',
    [req.params.id, req.actor.org_id]
  );
  const target = before[0];
  if (!target) return res.status(404).json({ error: 'User not found' });

  // An organisation whose only administrator cannot sign in can invite nobody
  // and answer no erasure request, and has no way back except the platform
  // operator. Suspension gets there as surely as deletion does.
  //
  // **This cannot currently fire, and neither can its twin below the deletion
  // route.** The only caller is an administrator of this same organisation, who
  // is refused their own account a few lines above — so whenever we reach here
  // there is by construction at least one other active administrator: the one
  // making the request. It is kept because the invariant is real and the cost
  // is one count, and because the first platform-level route that reuses this
  // logic will not have that property. It is not kept under the impression that
  // it is doing something today.
  if (status === 'suspended' && target.role === 'admin') {
    const { rows: remaining } = await pool.query(
      `SELECT count(*)::int AS n FROM users
        WHERE org_id = $1 AND role = 'admin' AND status = 'active' AND id <> $2`,
      [req.actor.org_id, target.id]
    );
    if (remaining[0].n === 0) {
      return res.status(409).json({
        error: 'This is the last active administrator of this organisation. Invite another one first.',
      });
    }
  }

  await pool.query('UPDATE users SET status = $1 WHERE id = $2 AND org_id = $3', [
    status,
    target.id,
    req.actor.org_id,
  ]);

  if (status === 'suspended') {
    await pool.query(`DELETE FROM session WHERE sess ->> 'userId' = $1`, [target.id]);
  }

  const admin = await currentAdmin(req);
  await recordRead(admin, {
    action: status === 'suspended' ? 'suspend' : 'reactivate',
    subjectId: target.id,
    // Captured here rather than joined later, like every other entry: the log
    // has to stay legible after the account it names is gone.
    subjectLabel: target.email,
  });

  res.json({ user: { id: target.id, status } });
});

adminRouter.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.session.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  // Read the identity before the row is gone: the audit entry is the only thing
  // that will still exist afterwards, and `subject_id` becomes NULL when the
  // user is removed.
  const { rows: before } = await pool.query(
    'SELECT id, display_name, email, role FROM users WHERE id = $1 AND org_id = $2',
    [req.params.id, req.actor.org_id]
  );
  if (!before[0]) return res.status(404).json({ error: 'User not found' });

  // An organization with no administrator can invite nobody and answer no
  // erasure request — it is locked out of its own account with no way back
  // except the platform operator. Refused rather than warned about.
  if (before[0].role === 'admin') {
    const { rows: remaining } = await pool.query(
      `SELECT count(*)::int AS n FROM users
        WHERE org_id = $1 AND role = 'admin' AND id <> $2`,
      [req.actor.org_id, before[0].id]
    );
    if (remaining[0].n === 0) {
      return res.status(409).json({
        error: 'This is the last administrator of this organisation. Invite another one first.',
      });
    }
  }

  const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1 AND org_id = $2', [
    req.params.id,
    req.actor.org_id,
  ]);
  if (rowCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  // `subject_id` is kept even though the row it pointed at is gone: it still
  // correlates every earlier read of this person's data with their deletion,
  // which is the question an investigation actually asks. The label is what
  // makes the row legible once the account no longer exists.
  const admin = await currentAdmin(req);
  await recordRead(admin, {
    action: 'erase',
    subjectId: before[0].id,
    subjectLabel: before[0].email,
  });
  console.log(`[admin] erased ${before[0].role} ${before[0].email} by ${admin?.email}`);

  res.status(204).end();
});

// ---------- data requests ----------

/**
 * The erasure queue.
 *
 * Deletions only. A copy of your own data stopped being a request when people
 * started downloading it themselves, and no administrator can produce one any
 * more — so an export row here would be an item nobody is able to action.
 * Rows written before that change are still in the table and still readable in
 * SQL; they are simply not put in front of someone as work.
 */
adminRouter.get('/data-requests', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.kind, d.requested_at, d.due_at, d.status, d.handled_at, d.note,
            u.id AS user_id, u.display_name, u.email, u.role,
            h.display_name AS handled_by_name
       FROM data_requests d
       JOIN users u ON u.id = d.user_id
       LEFT JOIN users h ON h.id = d.handled_by
      WHERE d.kind = 'erasure' AND u.org_id = $1
      ORDER BY (d.status = 'pending') DESC, d.due_at ASC
      LIMIT 200`,
    [req.actor.org_id]
  );
  res.json({ requests: rows });
});

/** Close a request: completed, or refused with a reason. */
adminRouter.post('/data-requests/:id/resolve', async (req, res) => {
  const status = req.body?.status;
  if (status !== 'completed' && status !== 'refused') {
    return res.status(400).json({ error: 'status must be completed or refused' });
  }
  // A refusal without a reason cannot be justified to anyone later, least of
  // all to the person refused.
  const note = (req.body?.note ?? '').trim();
  if (status === 'refused' && note.length === 0) {
    return res.status(400).json({ error: 'a refusal needs a reason' });
  }
  const { rowCount } = await pool.query(
    `UPDATE data_requests d
        SET status = $1, note = $2, handled_by = $3, handled_at = now()
       FROM users u
      WHERE d.id = $4 AND d.status = 'pending'
        AND u.id = d.user_id AND u.org_id = $5`,
    [status, note || null, req.session.userId, req.params.id, req.actor.org_id]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'no open request found' });
  res.status(204).end();
});

async function currentAdmin(req) {
  const { rows } = await pool.query('SELECT id, role, email FROM users WHERE id = $1', [
    req.session.userId,
  ]);
  return rows[0] ?? null;
}

adminRouter.get('/invitations', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.id,
            i.email,
            i.display_name,
            i.role,
            i.preferred_language,
            i.expires_at,
            i.accepted_at,
            i.created_at,
            u.display_name AS invited_by_name
     FROM user_invitations i
     LEFT JOIN users u ON u.id = i.invited_by
     WHERE i.org_id = $1
     ORDER BY i.created_at DESC`,
    [req.actor.org_id]
  );
  res.json({ invitations: rows });
});

adminRouter.delete('/invitations/:id', async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM user_invitations WHERE id = $1 AND accepted_at IS NULL AND org_id = $2',
    [req.params.id, req.actor.org_id]
  );
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Pending invitation not found' });
  }
  res.status(204).end();
});

adminRouter.post('/invitations', async (req, res) => {
  const parsed = InviteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const input = parsed.data;
  const email = input.email.toLowerCase();

  // The school's own language unless the administrator chose otherwise. The
  // interface preselects it too, but the rule belongs here as well: a client
  // that sends nothing should still produce a Serbian invitation for a Serbian
  // school rather than an English one.
  const language = input.preferred_language || req.actor.org_default_language || 'en';
  if (!isSupportedLanguage(language)) {
    return res.status(400).json({ error: supportedLanguageMessage() });
  }

  // The organization comes from the person issuing the invitation, never from
  // the request body. A client-supplied organization identifier is the classic
  // tenancy bypass, and here it would place a stranger's account inside a
  // school and give them a teacher's view of it. Enforced by the caller passing
  // `req.actor.org_id`, which is why that argument is not optional.
  const result = await issueInvitation({
    req,
    email,
    displayName: input.display_name,
    role: input.role,
    language,
    orgId: req.actor.org_id,
    orgName: req.actor.org_name,
    invitedBy: req.actor.display_name,
  });

  if (result.error) return res.status(result.status).json({ error: result.error });
  res.status(201).json({ invitation: result.invitation });
});

// ---------- groups ----------
//
// Built and, for now, unused. The partners were polled and had no preference,
// so nothing is switched on: with no groups defined, every teacher sees their
// whole organization exactly as before. A school that later wants classes
// creates one here — no migration, no deploy.
//
// Scoping is additive (see db/scope.js): a teacher gains a narrower view only
// once they are put in a group, never a broken one by omission.

adminRouter.get('/groups', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT g.id, g.name, g.created_at,
            (SELECT count(*)::int FROM group_students gs WHERE gs.group_id = g.id) AS students,
            (SELECT count(*)::int FROM group_teachers gt WHERE gt.group_id = g.id) AS teachers,
            COALESCE(
              (SELECT json_agg(json_build_object('id', u.id, 'display_name', u.display_name)
                       ORDER BY u.display_name)
                 FROM group_teachers gt JOIN users u ON u.id = gt.user_id
                WHERE gt.group_id = g.id), '[]'::json) AS teacher_list
       FROM groups g
      WHERE g.org_id = $1
      ORDER BY g.name`,
    [req.actor.org_id]
  );
  res.json({ groups: rows });
});

adminRouter.post('/groups', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (name.length < 1 || name.length > 120) {
    return res.status(400).json({ error: 'name must be between 1 and 120 characters' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO groups (org_id, name) VALUES ($1, $2) RETURNING id, name, created_at`,
      [req.actor.org_id, name]
    );
    res.status(201).json({ group: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A group with this name already exists' });
    }
    throw err;
  }
});

adminRouter.delete('/groups/:id', async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM groups WHERE id = $1 AND org_id = $2',
    [req.params.id, req.actor.org_id]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'Group not found' });
  res.status(204).end();
});

/**
 * Add or remove one person. The membership tables carry no organization column
 * of their own, so both the group and the person are checked against the
 * administrator's organization here — otherwise an id from another school
 * would be accepted on trust.
 */
adminRouter.post('/groups/:id/members', async (req, res) => {
  const userId = req.body?.user_id;
  const remove = req.body?.remove === true;
  if (!userId) return res.status(400).json({ error: 'user_id is required' });

  const { rows: checked } = await pool.query(
    `SELECT u.role
       FROM users u
       JOIN groups g ON g.id = $2 AND g.org_id = $3
      WHERE u.id = $1 AND u.org_id = $3`,
    [userId, req.params.id, req.actor.org_id]
  );
  if (!checked[0]) return res.status(404).json({ error: 'Group or person not found' });

  const role = checked[0].role;
  if (role !== 'student' && role !== 'teacher') {
    return res.status(400).json({ error: 'only students and teachers belong to groups' });
  }
  const table = role === 'student' ? 'group_students' : 'group_teachers';

  if (remove) {
    await pool.query(`DELETE FROM ${table} WHERE group_id = $1 AND user_id = $2`, [
      req.params.id,
      userId,
    ]);
  } else {
    await pool.query(
      `INSERT INTO ${table} (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.id, userId]
    );
  }
  res.status(204).end();
});

// ---------- content source ----------
//
// Which spreadsheet this school's interviews come from. No credentials are
// stored: access is granted the way Google grants it, by sharing the sheet with
// the platform's service account. Asking an administrator for a key would mean
// holding somebody's Google credentials to solve a problem that sharing solves.

adminRouter.get('/content-source', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.spreadsheet_id, c.updated_at, c.last_checked_at, c.last_check_ok,
            c.last_check_message, u.display_name AS updated_by_name
       FROM org_content_source c
       LEFT JOIN users u ON u.id = c.updated_by
      WHERE c.org_id = $1`,
    [req.actor.org_id]
  );
  res.json({
    content_source: rows[0] ?? null,
    service_account: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null,
  });
});

/**
 * Set the spreadsheet, after checking it actually works.
 *
 * The check is the point. An administrator who pastes a link to a sheet they
 * have not shared, or the wrong sheet, should find out here — not when a class
 * sits down and the catalogue is empty. A failing sheet is refused rather than
 * saved with a warning.
 */
adminRouter.put('/content-source', async (req, res) => {
  const raw = String(req.body?.spreadsheet_id ?? '').trim();
  if (!raw) return res.status(400).json({ error: 'A spreadsheet link or id is required' });

  // Accept a pasted URL as readily as a bare id — the id is what a person has
  // to dig out of the URL, and asking them to is a needless chance to slip.
  const fromUrl = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const sheetId = fromUrl ? fromUrl[1] : raw;
  if (!/^[a-zA-Z0-9-_]{20,}$/.test(sheetId)) {
    return res.status(400).json({ error: 'That does not look like a Google Sheets link or id' });
  }

  let ok = false;
  let message;
  try {
    const content = await loadSheetContent(sheetId);
    ok = true;
    message = `${content.scenarios.length} scenarios, ${content.questions.length} questions`;
  } catch (err) {
    ok = false;
    message = err.message ?? 'could not read the spreadsheet';
  }

  if (!ok) {
    await pool.query(
      `INSERT INTO org_content_source (org_id, last_checked_at, last_check_ok, last_check_message)
       VALUES ($1, now(), false, $2)
       ON CONFLICT (org_id) DO UPDATE
         SET last_checked_at = now(), last_check_ok = false, last_check_message = $2`,
      [req.actor.org_id, message]
    );
    return res.status(400).json({
      error: `Could not read that spreadsheet: ${message}`,
      hint: `Share it with ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? 'the platform service account'} as a Viewer.`,
    });
  }

  const { rows } = await pool.query(
    `INSERT INTO org_content_source
       (org_id, spreadsheet_id, updated_by, updated_at, last_checked_at, last_check_ok, last_check_message)
     VALUES ($1, $2, $3, now(), now(), true, $4)
     ON CONFLICT (org_id) DO UPDATE
       SET spreadsheet_id = $2, updated_by = $3, updated_at = now(),
           last_checked_at = now(), last_check_ok = true, last_check_message = $4
     RETURNING spreadsheet_id, updated_at, last_checked_at, last_check_ok, last_check_message`,
    [req.actor.org_id, sheetId, req.session.userId, message]
  );

  forgetContentSource(req.actor.org_id);
  res.json({ content_source: rows[0] });
});

/**
 * Import the spreadsheet as a new content version, and make it current.
 *
 * Never overwrites. The previous version keeps every row it had, which is what
 * lets an interview taken last week still render after a scenario is deleted
 * from the sheet this week.
 */
adminRouter.post('/content-source/sync', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT spreadsheet_id FROM org_content_source WHERE org_id = $1',
    [req.actor.org_id]
  );
  const sheetId = rows[0]?.spreadsheet_id;
  if (!sheetId) return res.status(400).json({ error: 'No spreadsheet is configured' });

  try {
    const result = await syncFromSheet({
      orgId: req.actor.org_id,
      sheetId,
      userId: req.session.userId,
      note: (req.body?.note ?? '').trim() || null,
    });
    await pool.query(
      `UPDATE org_content_source
          SET last_checked_at = now(), last_check_ok = true, last_check_message = $2
        WHERE org_id = $1`,
      [req.actor.org_id, `${result.counts.scenarios} scenarios, ${result.counts.questions} questions`]
    );
    res.json(result);
  } catch (err) {
    console.error('[admin] content sync failed:', err);
    const message = err.message ?? 'could not import the spreadsheet';
    await pool.query(
      `UPDATE org_content_source
          SET last_checked_at = now(), last_check_ok = false, last_check_message = $2
        WHERE org_id = $1`,
      [req.actor.org_id, message]
    );
    res.status(400).json({ error: message });
  }
});

/** Every import this organisation has made, newest first. */
adminRouter.get('/content-versions', async (req, res) => {
  res.json({ versions: await listVersions(req.actor.org_id) });
});

/**
 * Put an earlier version back in use.
 *
 * Changes what students can start. It does not change what a finished interview
 * shows — those resolve against their own pinned version, whatever is current.
 */
adminRouter.post('/content-versions/:id/revert', async (req, res) => {
  const id = await revertToVersion({ orgId: req.actor.org_id, versionId: req.params.id });
  if (!id) return res.status(404).json({ error: 'Version not found' });
  res.json({ ok: true, version_id: id });
});

// ---------------------------------------------------------------------------
// Session limits
// ---------------------------------------------------------------------------

/**
 * This school's allowance, and what it inherits.
 *
 * All three are returned — effective, platform default, and this school's own
 * override — because an administrator changing a number needs to see what it
 * replaces. A form showing only the number in force cannot distinguish "we
 * chose three" from "three is what we were given".
 */
adminRouter.get('/limits', async (req, res) => {
  res.json(await effectiveLimits(req.actor.org_id));
});

/**
 * Set or clear this school's override. `null` for a field means "go back to
 * the platform default"; 0 means "no limit".
 *
 * Nothing here touches an interview that already exists. Lowering the cap below
 * what a student has already used does not delete anything and does not stop
 * them finishing what is open — it only means they start nothing new until it
 * is raised again.
 */
adminRouter.put('/limits', async (req, res) => {
  const parsed = OrgLimitsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { attempts_per_scenario, total_interviews, cooldown_days } = parsed.data;
  await pool.query(
    `UPDATE organizations
        SET attempts_per_scenario = $2, total_interviews = $3, cooldown_days = $4
      WHERE id = $1`,
    [req.actor.org_id, attempts_per_scenario, total_interviews, cooldown_days]
  );
  res.json(await effectiveLimits(req.actor.org_id));
});

// ---------------------------------------------------------------------------
// Privacy notice, and who a student asks for help
// ---------------------------------------------------------------------------

/**
 * The parts of the privacy notice only this school can answer.
 *
 * Returns the gaps alongside the values. An administrator who has to open the
 * page to discover it is unfinished will not open it, so the count travels with
 * the data and the rail can carry it.
 */
adminRouter.get('/privacy-settings', async (req, res) => {
  const data = await schoolSettings(req.actor.org_id);
  if (!data) return res.status(404).json({ error: 'Organisation not found' });
  res.json(data);
});

adminRouter.put('/privacy-settings', async (req, res) => {
  const parsed = PrivacySettingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  // Only the keys this page owns. The support page writes the others, and a
  // form that clears a field it never showed is how settings quietly vanish.
  res.json(await saveSchoolSettings(req.actor.org_id, parsed.data, req.session.userId));
});

adminRouter.get('/support-settings', async (req, res) => {
  const data = await schoolSettings(req.actor.org_id);
  if (!data) return res.status(404).json({ error: 'Organisation not found' });
  const { rows } = await pool.query(
    'SELECT support_name, support_email FROM platform_settings WHERE id = true'
  );
  res.json({ settings: data.settings, platform: rows[0] ?? null });
});

adminRouter.put('/support-settings', async (req, res) => {
  const parsed = SupportSettingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const saved = await saveSchoolSettings(req.actor.org_id, parsed.data, req.session.userId);
  const { rows } = await pool.query(
    'SELECT support_name, support_email FROM platform_settings WHERE id = true'
  );
  res.json({ settings: saved.settings, platform: rows[0] ?? null });
});
